import {getCompany} from "./attio-api.server"
import {searchApolloAccounts, updateApolloAccount, createApolloAccount} from "./apollo-api.server"

/**
 * Sync a single Attio company record to Apollo
 * 
 * This function:
 * 1. Fetches the latest data from Attio
 * 2. Searches for the organization in Apollo by name
 * 3. Updates existing organization or creates new one
 * 
 * @param recordId - The Attio company record ID
 * @returns Object with created and updated counts
 */
export default async function syncCompanyToApollo(recordId: string): Promise<{created: number; updated: number}> {
    console.log(`[Company Sync] Starting sync to Apollo for company record ${recordId}`)
    
    // Step 1: Fetch the latest company record from Attio
    console.log(`[Company Sync] Fetching company record from Attio...`)
    const attioRecord = await getCompany(recordId)
    
    if (!attioRecord?.data) {
        throw new Error(`Failed to fetch Attio company record ${recordId}`)
    }
    
    const recordData = attioRecord.data
    const values = recordData.values || {}
    
    // Extract company name - required for sync
    // Attio stores name as an array: [{ name: "...", ... }]
    const nameData = values.name
    let companyName: string | null = null
    
    if (Array.isArray(nameData) && nameData.length > 0) {
        companyName = nameData[0]?.name || nameData[0]?.value || null
    } else if (typeof nameData === 'string') {
        companyName = nameData
    } else if (nameData && typeof nameData === 'object') {
        companyName = (nameData as any).name || (nameData as any).value || null
    }
    
    if (!companyName) {
        throw new Error(`No company name found for record ${recordId}. Name is required for syncing.`)
    }
    
    // Extract additional company attributes
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
            console.log(`[Company Sync] Extracted domain from "domains" field: "${domain}"`)
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
    
    const websiteUrl = extractAttioValue(values.website_url || values.website)
    const linkedinUrl = extractAttioValue(values.linkedin || values.linkedin_url)
    const twitterUrl = extractAttioValue(values.twitter || values.twitter_url)
    const facebookUrl = extractAttioValue(values.facebook || values.facebook_url)
    const instagramUrl = extractAttioValue(values.instagram || values.instagram_url)
    const description = extractAttioValue(values.description || values.bio || values.about)
    const industry = extractAttioValue(values.industry || values.sector)
    const numEmployees = extractNumberValue(values.num_employees || values.employee_count || values.estimated_num_employees)
    
    // Extract location fields
    const city = extractAttioValue(values.city || values.primary_location?.city)
    const state = extractAttioValue(values.state || values.primary_location?.state)
    const country = extractAttioValue(values.country || values.primary_location?.country)
    
    console.log(`[Company Sync] Extracted data from Attio:`, {
        name: companyName,
        website_url: websiteUrl,
        domain,
        linkedin_url: linkedinUrl,
        industry,
        num_employees: numEmployees,
    })
    
    // Step 2: Search for account in Apollo by name or domain
    // Apollo uses "Accounts" for companies, not "Organizations"
    let apolloAccounts: Awaited<ReturnType<typeof searchApolloAccounts>> = []
    
    // First try to find existing account by name (more reliable than domain)
    if (companyName) {
        console.log(`[Company Sync] Searching by company name first: ${companyName}`)
        apolloAccounts = await searchApolloAccounts({
            name: companyName,
            per_page: 50, // Get more results to find exact match
        })
        
        // Filter for exact name match (case-insensitive)
        const exactNameMatch = apolloAccounts.find(account => 
            account.name && account.name.toLowerCase().trim() === companyName.toLowerCase().trim()
        )
        
        if (exactNameMatch) {
            console.log(`[Company Sync] Found exact name match: ${exactNameMatch.name} (ID: ${exactNameMatch.id})`)
            apolloAccounts = [exactNameMatch]
        } else {
            console.log(`[Company Sync] No exact name match found`)
            apolloAccounts = []
        }
    }
    
    // If name search didn't work and we have a domain, try domain matching
    if (apolloAccounts.length === 0 && domain) {
        console.log(`[Company Sync] No name match, trying domain search: ${domain}`)
        const domainResults = await searchApolloAccounts({
            name: companyName || undefined, // Search by name if available
            per_page: 50,
        })
        
        // Filter for exact domain match
        const attioDomainLower = domain.toLowerCase().trim()
        const exactDomainMatch = domainResults.find(account => {
            if (account.domain) {
                const accountDomain = account.domain.replace(/^www\./, '').toLowerCase().trim()
                return accountDomain === attioDomainLower
            }
            if (account.website_url) {
                try {
                    const accountUrl = new URL(account.website_url.startsWith('http') ? account.website_url : `https://${account.website_url}`)
                    const accountDomain = accountUrl.hostname.replace(/^www\./, '').toLowerCase()
                    return accountDomain === attioDomainLower
                } catch {
                    const domainMatch = account.website_url.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/)
                    if (domainMatch) {
                        const accountDomain = domainMatch[1].replace(/^www\./, '').toLowerCase()
                        return accountDomain === attioDomainLower
                    }
                }
            }
            return false
        })
        
        if (exactDomainMatch) {
            console.log(`[Company Sync] Found exact domain match: ${exactDomainMatch.name} (${exactDomainMatch.domain || exactDomainMatch.website_url})`)
            apolloAccounts = [exactDomainMatch]
        }
    }
    
    // Step 3: Update existing account or create new one
    let accountId: string | null = null
    let bestMatch: Awaited<ReturnType<typeof searchApolloAccounts>>[0] | null = null
    
    if (apolloAccounts.length > 0) {
        bestMatch = apolloAccounts[0]
        accountId = bestMatch.id || null
        if (accountId) {
            console.log(`[Company Sync] Found existing Apollo account: ${bestMatch.name} (ID: ${accountId})`)
        }
    }
    
    const updateData: {
        name?: string
        website_url?: string | null
        linkedin_url?: string | null
        twitter_url?: string | null
        facebook_url?: string | null
        instagram_url?: string | null
        description?: string | null
        industry?: string | null
        estimated_num_employees?: number | null
        city?: string | null
        state?: string | null
        country?: string | null
    } = {}
    
    if (companyName) {
        updateData.name = companyName
    }
    if (websiteUrl) {
        updateData.website_url = websiteUrl
    }
    if (linkedinUrl) {
        updateData.linkedin_url = linkedinUrl
    }
    if (twitterUrl) {
        updateData.twitter_url = twitterUrl
    }
    if (facebookUrl) {
        updateData.facebook_url = facebookUrl
    }
    if (instagramUrl) {
        updateData.instagram_url = instagramUrl
    }
    if (description) {
        updateData.description = description
    }
    if (industry) {
        updateData.industry = industry
    }
    if (numEmployees !== null) {
        updateData.estimated_num_employees = numEmployees
    }
    if (city) {
        updateData.city = city
    }
    if (state) {
        updateData.state = state
    }
    if (country) {
        updateData.country = country
    }
    
    if (accountId && bestMatch) {
        // Update existing account
        console.log(`[Company Sync] Updating existing Apollo account ${accountId}...`)
        console.log(`[Company Sync] Update data being sent to Apollo:`, updateData)
        
        const updatedAccount = await updateApolloAccount(accountId, updateData)
        
        console.log(`[Company Sync] Apollo account updated successfully:`, {
            id: updatedAccount.id,
            name: updatedAccount.name,
        })
        
        return {created: 0, updated: 1}
    } else {
        // Create new account
        console.log(`[Company Sync] No existing account found, creating new account in Apollo...`)
        
        const newAccount = await createApolloAccount({
            name: companyName,
            website_url: websiteUrl,
            linkedin_url: linkedinUrl,
            twitter_url: twitterUrl,
            facebook_url: facebookUrl,
            instagram_url: instagramUrl,
            description: description,
            industry: industry,
            estimated_num_employees: numEmployees,
            city: city,
            state: state,
            country: country,
        })
        
        console.log(`[Company Sync] Apollo account created successfully:`, {
            id: newAccount.id,
            name: newAccount.name,
        })
        
        return {created: 1, updated: 0}
    }
}

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
 * Extract a number value from Attio's attribute format
 */
function extractNumberValue(attioData: unknown): number | null {
    if (!attioData) return null
    
    if (Array.isArray(attioData) && attioData.length > 0) {
        const entry = attioData[0]
        if (entry?.value !== undefined && entry?.value !== null) {
            const num = Number(entry.value)
            return isNaN(num) ? null : num
        }
    }
    
    if (typeof attioData === 'number') {
        return attioData
    }
    
    if (typeof attioData === 'string') {
        const num = Number(attioData)
        return isNaN(num) ? null : num
    }
    
    return null
}

