/**
 * Opportunity/Deal stage mapping between Attio and Apollo
 * Uses Apollo's Sales Pipeline stages
 */

import {listApolloOpportunityStages} from "./apollo-api.server"

// Cache for Apollo opportunity stages (fetched once per sync session)
let apolloOpportunityStagesCache: Array<{id: string; name: string}> | null = null

/**
 * Fetch and cache Apollo opportunity stages from Sales Pipeline
 */
async function getApolloOpportunityStages(): Promise<Array<{id: string; name: string}>> {
    if (apolloOpportunityStagesCache) {
        return apolloOpportunityStagesCache
    }
    
    try {
        const stages = await listApolloOpportunityStages()
        apolloOpportunityStagesCache = stages.map(s => ({ id: s.id, name: s.name }))
        console.log(`[Opportunity Stage Mapping] Fetched ${apolloOpportunityStagesCache.length} Apollo opportunity stages`)
        return apolloOpportunityStagesCache
    } catch (error) {
        console.error(`[Opportunity Stage Mapping] Failed to fetch Apollo opportunity stages:`, error)
        return []
    }
}

// Manual stage mappings (Attio deal stage name -> Apollo opportunity stage name)
// These ensure exact 1:1 mappings between Attio and Apollo deal stages
const OPPORTUNITY_STAGE_NAME_MAPPING: Record<string, string> = {
    "NS/Reschedule": "NS/Reschedule",
    "Discovery Call Booked": "Discovery Call Booked",
    "Proposal Sent": "Proposal Sent",
    "Negotiation": "Negotiation",
    "Contract Sent": "Contract Sent",
    "Closed Won": "Closed Won",
    "Closed Lost": "Closed Lost",
    "On Hold": "On Hold",
    // Normalized versions for case-insensitive matching
    "ns/reschedule": "NS/Reschedule",
    "discovery call booked": "Discovery Call Booked",
    "proposal sent": "Proposal Sent",
    "negotiation": "Negotiation",
    "contract sent": "Contract Sent",
    "closed won": "Closed Won",
    "closed lost": "Closed Lost",
    "on hold": "On Hold",
}

/**
 * Normalize stage value (trim, lowercase for comparison)
 */
function normalizeStage(stage: string | null | undefined): string | null {
    if (!stage) return null
    return stage.trim().toLowerCase()
}

/**
 * Find Apollo opportunity stage ID by name (case-insensitive)
 */
async function findApolloOpportunityStageIdByName(stageName: string): Promise<string | null> {
    const stages = await getApolloOpportunityStages()
    
    if (stages.length === 0) {
        console.warn(`[Opportunity Stage Mapping] No Apollo opportunity stages available`)
        return null
    }
    
    const normalizedSearch = normalizeStage(stageName)
    if (!normalizedSearch) return null
    
    // Try exact match first (case-insensitive)
    const exactMatch = stages.find(s => normalizeStage(s.name) === normalizedSearch)
    if (exactMatch) {
        console.log(`[Opportunity Stage Mapping] Found exact match: "${stageName}" -> "${exactMatch.name}" (ID: ${exactMatch.id})`)
        return exactMatch.id
    }
    
    // Try partial match
    const partialMatch = stages.find(s => {
        const normalized = normalizeStage(s.name)
        return normalized && (normalized.includes(normalizedSearch) || normalizedSearch.includes(normalized))
    })
    if (partialMatch) {
        console.log(`[Opportunity Stage Mapping] Found partial match: "${stageName}" -> "${partialMatch.name}" (ID: ${partialMatch.id})`)
        return partialMatch.id
    }
    
    console.warn(`[Opportunity Stage Mapping] No Apollo opportunity stage found matching "${stageName}" in Apollo stages`)
    return null
}

/**
 * Map Attio deal stage to Apollo opportunity stage ID
 * Returns the Apollo stage ID if found, or null if not found (so we don't send invalid stage names)
 */
export async function mapDealStageToApollo(attioStage: string | null | undefined): Promise<string | null | undefined> {
    if (!attioStage) return attioStage
    
    // Trim whitespace from the stage name
    const trimmedStage = attioStage.trim()
    
    // Check if it's already an Apollo stage ID (long alphanumeric string)
    if (trimmedStage.length > 20 && /^[a-zA-Z0-9]+$/.test(trimmedStage)) {
        console.log(`[Opportunity Stage Mapping] "${trimmedStage}" appears to be an Apollo stage ID, using as-is`)
        return trimmedStage
    }
    
    // First check manual mapping with exact match
    const mappedName = OPPORTUNITY_STAGE_NAME_MAPPING[trimmedStage]
    if (mappedName) {
        console.log(`[Opportunity Stage Mapping] Using manual mapping: "${trimmedStage}" -> "${mappedName}"`)
        const stageId = await findApolloOpportunityStageIdByName(mappedName)
        if (stageId) {
            console.log(`[Opportunity Stage Mapping] Successfully mapped "${trimmedStage}" to Apollo stage ID: ${stageId}`)
            return stageId
        }
    }
    
    // Try normalized manual mapping (case-insensitive)
    const normalized = normalizeStage(trimmedStage)
    if (normalized && normalized !== trimmedStage) {
        const normalizedMappedName = OPPORTUNITY_STAGE_NAME_MAPPING[normalized]
        if (normalizedMappedName) {
            console.log(`[Opportunity Stage Mapping] Using normalized manual mapping: "${trimmedStage}" -> "${normalizedMappedName}"`)
            const stageId = await findApolloOpportunityStageIdByName(normalizedMappedName)
            if (stageId) {
                console.log(`[Opportunity Stage Mapping] Successfully mapped "${trimmedStage}" to Apollo stage ID: ${stageId}`)
                return stageId
            }
        }
    }
    
    // Try to find Apollo stage by name directly (exact match)
    const stageId = await findApolloOpportunityStageIdByName(trimmedStage)
    if (stageId) {
        console.log(`[Opportunity Stage Mapping] Found direct match for "${trimmedStage}" -> Apollo stage ID: ${stageId}`)
        return stageId
    }
    
    // No mapping found - log a warning and return the original stage name
    // This allows Apollo to try matching by name, or we can use stage_name as fallback
    console.warn(`[Opportunity Stage Mapping] No Apollo opportunity stage ID found for Attio stage "${trimmedStage}". Will use stage_name instead.`)
    return trimmedStage
}

