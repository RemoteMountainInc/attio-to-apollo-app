import {getCompany} from "./attio-api.server"
import {searchApolloAccounts} from "./apollo-api.server"
// import {findCompanyViaContacts} from "./find-company-via-contacts.server" // Unused

/**
 * Extract a value from Attio's attribute format
 */
function extractAttioValue(attioData: unknown): string | null {
    if (!attioData) return null
    
    if (Array.isArray(attioData) && attioData.length > 0) {
        const entry = attioData[0]
        if (entry?.value !== undefined && entry?.value !== null) {
            return String(entry.value)
        }
        if (entry?.name) {
            return String(entry.name)
        }
        return entry?.title || entry?.label || null
    }
    
    if (typeof attioData === 'string' || typeof attioData === 'number') {
        return String(attioData)
    }
    
    if (typeof attioData === 'object' && attioData !== null) {
        const obj = attioData as Record<string, unknown>
        const value = obj.value
        const name = obj.name
        const title = obj.title
        const label = obj.label
        // Ensure we return string | null, not {} | null
        if (typeof value === 'string') return value
        if (typeof name === 'string') return name
        if (typeof title === 'string') return title
        if (typeof label === 'string') return label
        return null
    }
    
    return null
}

/**
 * Get Apollo account ID for an Attio company record
 * Searches Apollo by domain (preferred) or company name to find the account ID
 * Apollo uses "Accounts" for companies, not "Organizations"
 */
export default async function getApolloOrganizationId(recordId: string): Promise<string | null> {
    // Fetch the Attio record to get the company data
    const attioRecord = await getCompany(recordId)
    
    if (!attioRecord?.data) {
        throw new Error(`Failed to fetch Attio company record ${recordId}`)
    }
    
    const values = attioRecord.data.values || {}
    const nameData = values.name
    
    let companyName: string | null = null
    if (Array.isArray(nameData) && nameData.length > 0) {
        companyName = nameData[0]?.name || nameData[0]?.value || null
    } else if (typeof nameData === 'string') {
        companyName = nameData
    } else if (nameData && typeof nameData === 'object') {
        companyName = (nameData as any).name || (nameData as any).value || null
    }
    
    // Extract domain from Attio field with slug "domains" (field ID: 3f8e7acf-48f2-4253-8f7f-a5559a3eefe3)
    // Domains might be stored as an array of domain objects
    const domainData = values.domains
    let domain: string | null = null
    
    if (domainData) {
        // Handle array of domains - take the first one
        if (Array.isArray(domainData) && domainData.length > 0) {
            // Each domain might be an object with a value or name field
            const firstDomain = domainData[0]
            if (typeof firstDomain === 'string') {
                domain = firstDomain
            } else if (firstDomain && typeof firstDomain === 'object') {
                // Try different possible field names
                domain = (firstDomain as any).value || (firstDomain as any).name || (firstDomain as any).domain || (firstDomain as any).title || null
            }
        } else {
            // Extract domain value - it should be just the domain name (no http/https)
            domain = extractAttioValue(domainData)
        }
        
        if (domain) {
            // Clean up domain: remove http://, https://, www., and trailing slashes
            domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim()
            console.log(`[Get Org ID] Extracted domain from "domains" field: "${domain}"`)
        }
    }
    
    // If no domain from domains field, try to extract from website_url
    if (!domain) {
        const websiteUrl = extractAttioValue(values.website_url || values.website || values.domain)
        if (websiteUrl) {
            try {
                const url = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
                domain = url.hostname.replace(/^www\./, '')
            } catch (e) {
                // If URL parsing fails, try to extract domain from string
                const domainMatch = websiteUrl.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/)
                if (domainMatch) {
                    domain = domainMatch[1]
                }
            }
        }
    }
    
    // Search for account in Apollo by domain (preferred) or name
    // Apollo uses "Accounts" for companies
    let apolloAccounts: Awaited<ReturnType<typeof searchApolloAccounts>> = []
    
    if (domain) {
        console.log(`[Get Org ID] Searching for account in Apollo by domain: ${domain}`)
        // Apollo's domain parameter search seems to return unrelated results
        // Instead, search by company name first (more reliable), then filter by domain
        if (companyName) {
            console.log(`[Get Org ID] Searching by company name first: ${companyName}`)
            apolloAccounts = await searchApolloAccounts({
                name: companyName,
                per_page: 50, // Get more results to find exact match
            })
            
            // Filter results by exact domain match
            const exactMatch = apolloAccounts.find(account => {
                if (account.domain) {
                    const accountDomain = account.domain.replace(/^www\./, '').toLowerCase().trim()
                    return accountDomain === domain.toLowerCase().trim()
                }
                if (account.website_url) {
                    try {
                        const accountUrl = new URL(account.website_url.startsWith('http') ? account.website_url : `https://${account.website_url}`)
                        const accountDomain = accountUrl.hostname.replace(/^www\./, '').toLowerCase()
                        return accountDomain === domain.toLowerCase()
                    } catch {
                        return false
                    }
                }
                return false
            })
            
            if (exactMatch) {
                console.log(`[Get Org ID] Found exact domain match via name search: ${exactMatch.name} (${exactMatch.domain || exactMatch.website_url})`)
                apolloAccounts = [exactMatch] // Use only the exact match
            } else {
                console.log(`[Get Org ID] No exact domain match in name search results`)
                apolloAccounts = [] // Clear results if no exact match
            }
        }
        
        // If name search didn't work, try domain parameter (but it's unreliable)
        if (apolloAccounts.length === 0) {
            console.log(`[Get Org ID] Trying domain parameter search: ${domain}`)
            const domainResults = await searchApolloAccounts({
                domain: domain,
                per_page: 50,
            })
            
            // Filter for exact domain match (Apollo's domain search returns unrelated results)
            const exactMatch = domainResults.find(account => {
                if (account.domain) {
                    const accountDomain = account.domain.replace(/^www\./, '').toLowerCase().trim()
                    return accountDomain === domain.toLowerCase().trim()
                }
                if (account.website_url) {
                    try {
                        const accountUrl = new URL(account.website_url.startsWith('http') ? account.website_url : `https://${account.website_url}`)
                        const accountDomain = accountUrl.hostname.replace(/^www\./, '').toLowerCase()
                        return accountDomain === domain.toLowerCase()
                    } catch {
                        return false
                    }
                }
                return false
            })
            
            if (exactMatch) {
                console.log(`[Get Org ID] Found exact domain match in domain search: ${exactMatch.name} (${exactMatch.domain || exactMatch.website_url})`)
                apolloAccounts = [exactMatch]
            }
        }
        
        // If no results by name/domain, try website_url
        if (apolloAccounts.length === 0) {
            const websiteUrl = extractAttioValue(values.website_url || values.website)
            if (websiteUrl) {
                console.log(`[Get Org ID] No results by name/domain, trying website_url: ${websiteUrl}`)
                apolloAccounts = await searchApolloAccounts({
                    website_url: websiteUrl,
                    per_page: 20,
                })
            }
        }
    }
    
    // Fallback to name search if domain search didn't work
    if (apolloAccounts.length === 0 && companyName) {
        console.log(`[Get Org ID] Searching for account in Apollo by name: ${companyName}`)
        apolloAccounts = await searchApolloAccounts({
            name: companyName,
            per_page: 20,
        })
    }
    
    if (apolloAccounts.length > 0) {
        // Find the best matching account
        let bestMatch = apolloAccounts[0]
        
        // If we have a domain, prioritize exact domain match
        if (domain && apolloAccounts.length > 1) {
            const exactDomainMatch = apolloAccounts.find(account => {
                if (account.domain) {
                    const accountDomain = account.domain.replace(/^www\./, '').toLowerCase().trim()
                    return accountDomain === domain.toLowerCase().trim()
                }
                if (account.website_url) {
                    try {
                        const accountUrl = new URL(account.website_url.startsWith('http') ? account.website_url : `https://${account.website_url}`)
                        const accountDomain = accountUrl.hostname.replace(/^www\./, '').toLowerCase()
                        return accountDomain === domain.toLowerCase()
                    } catch {
                        return false
                    }
                }
                return false
            })
            if (exactDomainMatch) {
                bestMatch = exactDomainMatch
                console.log(`[Get Org ID] Found exact domain match: ${bestMatch.id}`)
            }
        }
        
        if (bestMatch.id) {
            return bestMatch.id
        }
    }
    
    return null
}

