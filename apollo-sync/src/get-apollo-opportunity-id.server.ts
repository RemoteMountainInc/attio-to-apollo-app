import {getDeal} from "./attio-api.server"
import {searchApolloOpportunities} from "./apollo-api.server"

/**
 * Get Apollo opportunity ID for an Attio deal record
 * Searches Apollo by deal name to find the opportunity ID
 */
export default async function getApolloOpportunityId(recordId: string): Promise<string | null> {
    // Fetch the Attio record to get the deal name
    const attioRecord = await getDeal(recordId)
    
    if (!attioRecord?.data) {
        throw new Error(`Failed to fetch Attio deal record ${recordId}`)
    }
    
    const values = attioRecord.data.values || {}
    const nameData = values.name || values.title
    
    let dealName: string | null = null
    if (Array.isArray(nameData) && nameData.length > 0) {
        dealName = nameData[0]?.name || nameData[0]?.value || nameData[0]?.title || null
    } else if (typeof nameData === 'string') {
        dealName = nameData
    } else if (nameData && typeof nameData === 'object') {
        dealName = (nameData as any).name || (nameData as any).value || (nameData as any).title || null
    }
    
    if (!dealName) {
        throw new Error(`No deal name found for record ${recordId}. Name is required to find Apollo opportunity.`)
    }
    
    // Search for opportunity in Apollo by deal name
    // Try exact name match first, then fallback to keyword search
    let apolloOpps = await searchApolloOpportunities({
        name: dealName,
        per_page: 20,
    })
    
    // If no results with name parameter, try q_keywords
    if (apolloOpps.length === 0) {
        console.log(`[Get Opportunity ID] No results with name parameter, trying q_keywords: ${dealName}`)
        apolloOpps = await searchApolloOpportunities({
            q_keywords: dealName,
            per_page: 20,
        })
    }
    
    // Find exact name match (case-insensitive)
    const matchedOpp = apolloOpps.find(opp => 
        opp.name && opp.name.toLowerCase().trim() === dealName.toLowerCase().trim()
    )
    
    if (matchedOpp && matchedOpp.id) {
        console.log(`[Get Opportunity ID] Found exact match: ${matchedOpp.name} (ID: ${matchedOpp.id})`)
        return matchedOpp.id
    }
    
    // If no exact match, use first result
    if (apolloOpps.length > 0 && apolloOpps[0].id) {
        console.log(`[Get Opportunity ID] No exact name match, using first result: ${apolloOpps[0].name} (ID: ${apolloOpps[0].id})`)
        return apolloOpps[0].id
    }
    
    console.log(`[Get Opportunity ID] No opportunity found in Apollo for deal: ${dealName}`)
    return null
}

