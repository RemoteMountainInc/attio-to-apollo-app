import {listApolloContactStages} from "./apollo-api.server"

/**
 * Stage value mapping between Attio and Apollo
 * 
 * This mapping ensures that stage values are correctly translated between systems.
 * If a stage value doesn't have a mapping, it will be passed through as-is,
 * but a warning will be logged.
 */

// Cache for Apollo stages (fetched once per sync session)
let apolloStagesCache: Array<{id: string; name: string}> | null = null

/**
 * Fetch and cache Apollo contact stages
 */
async function getApolloStages(): Promise<Array<{id: string; name: string}>> {
    if (apolloStagesCache) {
        return apolloStagesCache
    }
    
    try {
        const stages = await listApolloContactStages()
        apolloStagesCache = stages.map(s => ({ id: s.id, name: s.name }))
        console.log(`[Stage Mapping] Fetched ${apolloStagesCache.length} Apollo contact stages`)
        return apolloStagesCache
    } catch (error) {
        console.warn(`[Stage Mapping] Failed to fetch Apollo stages:`, error)
        return []
    }
}

// Manual stage mappings (Attio stage name -> Apollo stage name)
// Format: { attioStageName: apolloStageName }
const STAGE_NAME_MAPPING: Record<string, string> = {
    // Add your custom mappings here
    // Example: "Qualified Lead": "Qualified",
    // Example: "New Contact": "New",
}

/**
 * Normalize stage value (trim, lowercase for comparison)
 */
function normalizeStage(stage: string | null | undefined): string | null {
    if (!stage) return null
    return stage.trim().toLowerCase()
}

/**
 * Find Apollo stage ID by name (case-insensitive)
 * Since Attio and Apollo stage names match, we do direct name matching
 */
async function findApolloStageIdByName(stageName: string): Promise<string | null> {
    const stages = await getApolloStages()
    const normalized = normalizeStage(stageName)
    
    console.log(`[Stage Mapping] Looking for Apollo stage with name: "${stageName}" (normalized: "${normalized}")`)
    console.log(`[Stage Mapping] Available Apollo stages:`, stages.map(s => s.name))
    
    // First try exact match (case-insensitive)
    const exactMatch = stages.find(s => normalizeStage(s.name) === normalized)
    if (exactMatch) {
        console.log(`[Stage Mapping] Found exact match for "${stageName}" -> Apollo stage ID: ${exactMatch.id} (name: "${exactMatch.name}")`)
        return exactMatch.id
    }
    
    // Try partial match (contains)
    const partialMatch = stages.find(s => {
        const sNormalized = normalizeStage(s.name)
        return sNormalized?.includes(normalized || "") || normalized?.includes(sNormalized || "")
    })
    if (partialMatch) {
        console.log(`[Stage Mapping] Found partial match for "${stageName}" -> Apollo stage ID: ${partialMatch.id} (name: "${partialMatch.name}")`)
        return partialMatch.id
    }
    
    console.warn(`[Stage Mapping] No match found for "${stageName}" in Apollo stages`)
    return null
}

/**
 * Map Attio stage value to Apollo stage ID
 * Returns the Apollo stage ID if found, or the original value if not
 */
export async function mapStageToApollo(attioStage: string | null | undefined): Promise<string | null | undefined> {
    if (!attioStage) return attioStage
    
    // First check manual mapping
    const mappedName = STAGE_NAME_MAPPING[attioStage] || STAGE_NAME_MAPPING[normalizeStage(attioStage) || ""]
    if (mappedName) {
        console.log(`[Stage Mapping] Using manual mapping: "${attioStage}" -> "${mappedName}"`)
        const stageId = await findApolloStageIdByName(mappedName)
        if (stageId) return stageId
    }
    
    // Try to find Apollo stage by name directly
    const stageId = await findApolloStageIdByName(attioStage)
    if (stageId) {
        return stageId
    }
    
    // Check if it's already an Apollo stage ID (long alphanumeric string)
    if (attioStage.length > 20 && /^[a-zA-Z0-9]+$/.test(attioStage)) {
        console.log(`[Stage Mapping] "${attioStage}" appears to be an Apollo stage ID, using as-is`)
        return attioStage
    }
    
    // No mapping found - log a warning but pass through the original value
    console.warn(`[Stage Mapping] No Apollo stage found for Attio stage "${attioStage}". Passing through as-is.`)
    return attioStage
}

/**
 * Map Apollo stage ID or name to Attio stage value
 * Returns the mapped value or the original if no mapping exists
 */
export async function mapStageToAttio(apolloStage: string | null | undefined): Promise<string | null | undefined> {
    if (!apolloStage) return apolloStage
    
    // If it's a stage ID, look up the name
    if (apolloStage.length > 20 && /^[a-zA-Z0-9]+$/.test(apolloStage)) {
        const stages = await getApolloStages()
        const stage = stages.find(s => s.id === apolloStage)
        if (stage) {
            console.log(`[Stage Mapping] Found Apollo stage ID "${apolloStage}" -> name: "${stage.name}"`)
            // Try to reverse map the name to Attio
            const reverseMapping = Object.entries(STAGE_NAME_MAPPING).find(([_, apolloName]) => 
                normalizeStage(apolloName) === normalizeStage(stage.name)
            )
            if (reverseMapping) {
                return reverseMapping[0]
            }
            // If no reverse mapping, return the Apollo stage name
            return stage.name
        }
    }
    
    // It's a stage name, try reverse mapping
    const reverseMapping = Object.entries(STAGE_NAME_MAPPING).find(([_, apolloName]) => 
        normalizeStage(apolloName) === normalizeStage(apolloStage)
    )
    if (reverseMapping) {
        console.log(`[Stage Mapping] Reverse mapped Apollo stage "${apolloStage}" -> Attio: "${reverseMapping[0]}"`)
        return reverseMapping[0]
    }
    
    // No mapping found - pass through
    return apolloStage
}

/**
 * Validate if a stage value exists in the mapping
 * Useful for detecting unmapped values
 */
export async function validateStageMapping(attioStage: string | null | undefined, apolloStage: string | null | undefined): Promise<{
    isValid: boolean
    warnings: string[]
}> {
    const warnings: string[] = []
    
    if (attioStage) {
        const mapped = await mapStageToApollo(attioStage)
        if (mapped === attioStage && !STAGE_NAME_MAPPING[attioStage]) {
            warnings.push(`Attio stage "${attioStage}" is not mapped to Apollo`)
        }
    }
    
    if (apolloStage) {
        const stages = await getApolloStages()
        const isId = apolloStage.length > 20 && /^[a-zA-Z0-9]+$/.test(apolloStage)
        const found = isId 
            ? stages.find(s => s.id === apolloStage)
            : stages.find(s => normalizeStage(s.name) === normalizeStage(apolloStage))
        
        if (!found) {
            warnings.push(`Apollo stage "${apolloStage}" not found in Apollo contact stages`)
        }
    }
    
    return {
        isValid: warnings.length === 0,
        warnings
    }
}
