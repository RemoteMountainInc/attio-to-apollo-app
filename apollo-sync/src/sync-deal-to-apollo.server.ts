import {getDeal} from "./attio-api.server"
import {searchApolloOpportunities, createApolloOpportunity, updateApolloOpportunity} from "./apollo-api.server"
import {mapDealStageToApollo} from "./opportunity-stage-mapping.server"

/**
 * Sync a single Attio deal record to Apollo
 * 
 * This function:
 * 1. Fetches the latest data from Attio
 * 2. Searches for the opportunity in Apollo by name
 * 3. Updates existing opportunity or creates new one
 * 
 * @param recordId - The Attio deal record ID
 * @returns Object with created and updated counts
 */
export default async function syncDealToApollo(recordId: string): Promise<{created: number; updated: number}> {
    console.log(`[Deal Sync] Starting sync to Apollo for deal record ${recordId}`)
    
    // Step 1: Fetch the latest deal record from Attio
    console.log(`[Deal Sync] Fetching deal record from Attio...`)
    const attioRecord = await getDeal(recordId)
    
    if (!attioRecord?.data) {
        throw new Error(`Failed to fetch Attio deal record ${recordId}`)
    }
    
    const recordData = attioRecord.data
    const values = recordData.values || {}
    
    // Log all available fields to help debug
    console.log(`[Deal Sync] Available fields in Attio deal record:`, Object.keys(values))
    console.log(`[Deal Sync] Sample of values object:`, JSON.stringify(Object.fromEntries(
        Object.entries(values).slice(0, 10).map(([key, val]) => [key, Array.isArray(val) ? `[Array(${val.length})]` : typeof val])
    ), null, 2))
    
    // Extract deal name - required for sync
    // Attio stores name as an array: [{ name: "...", ... }]
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
        throw new Error(`No deal name found for record ${recordId}. Name is required for syncing.`)
    }
    
    // Extract additional deal attributes
    // Log what we're trying to extract
    console.log(`[Deal Sync] Attempting to extract attributes from fields:`, {
        amount: values.amount ? 'found' : 'not found',
        value: values.value ? 'found' : 'not found',
        deal_value: values.deal_value ? 'found' : 'not found',
        stage: values.stage ? 'found' : 'not found',
        probability: values.probability ? 'found' : 'not found',
        close_date: values.close_date ? 'found' : 'not found',
        description: values.description ? 'found' : 'not found',
    })
    
    // Try multiple field names for amount
    // The "value" field exists, so extract from it properly
    // Log the raw value field to see its structure
    if (values.value) {
        console.log(`[Deal Sync] Raw value field structure:`, JSON.stringify(values.value, null, 2))
    }
    const amount = extractNumberValue(values.amount || values.value || values.deal_value || values.total_value || values.deal_amount)
    
    // Extract stage using the slug "stage" (field ID: 9362ed94-8d8f-4df5-b99f-2db012ca1e20)
    // Stage is stored as a status field with status.title (not option.title)
    let attioStage: string | null = null
    if (values.stage) {
        if (Array.isArray(values.stage) && values.stage.length > 0) {
            const stageEntry = values.stage[0]
            // Check for status.title format (for status attribute type)
            if (stageEntry?.status?.title) {
                attioStage = String(stageEntry.status.title).trim()
                console.log(`[Deal Sync] Extracted stage from status.title: "${attioStage}"`)
            }
            // Fallback to option.title format (for select attribute type)
            else if (stageEntry?.option?.title) {
                attioStage = String(stageEntry.option.title).trim()
                console.log(`[Deal Sync] Extracted stage from option.title: "${attioStage}"`)
            }
            // Fallback to value field
            else if (stageEntry?.value) {
                attioStage = String(stageEntry.value).trim()
                console.log(`[Deal Sync] Extracted stage from value: "${attioStage}"`)
            }
        } else if (typeof values.stage === 'string') {
            attioStage = values.stage.trim()
        } else if (values.stage && typeof values.stage === 'object') {
            const stageObj = values.stage as any
            if (stageObj.status?.title) {
                attioStage = String(stageObj.status.title).trim()
            } else if (stageObj.option?.title) {
                attioStage = String(stageObj.option.title).trim()
            } else if (stageObj.value) {
                attioStage = String(stageObj.value).trim()
            }
        }
    }
    
    // Try multiple field names for probability
    const probability = extractNumberValue(values.probability || values.close_probability || values.win_probability || values.probability_percent)
    
    // Try multiple field names for close date
    const closeDate = extractAttioValue(values.close_date || values.expected_close_date || values.closed_date || values.target_close_date || values.closeDate)
    
    // Try multiple field names for description
    const description = extractAttioValue(values.description || values.notes || values.deal_notes || values.summary)
    
    console.log(`[Deal Sync] Extracted deal attributes from Attio:`, {
        amount,
        attioStage,
        probability,
        closeDate,
        description,
    })
    
    // If stage is null, log the raw stage value to see what we're getting
    if (!attioStage && values.stage) {
        console.log(`[Deal Sync] Stage field exists but extraction returned null. Raw value:`, JSON.stringify(values.stage, null, 2))
    }
    
    // Apollo uses "stage_name" for the stage field (not stage_id or stage)
    // We'll send the Attio stage name directly to Apollo as stage_name
    
    // Extract associated company/account
    // Apollo uses "account_id" for deals, not "organization_id"
    let accountId: string | null = null
    let accountName: string | null = null
    let attioCompanyRecordId: string | null = null
    
    const companyData = values.company || values.organization || values.associated_company
    if (companyData) {
        if (Array.isArray(companyData) && companyData.length > 0) {
            const company = companyData[0]
            attioCompanyRecordId = company?.id?.record_id || company?.id || null
            accountName = company?.name || company?.title || company?.value || null
        } else if (typeof companyData === 'object' && companyData !== null) {
            attioCompanyRecordId = (companyData as any).id?.record_id || (companyData as any).id || null
            accountName = (companyData as any).name || (companyData as any).title || (companyData as any).value || null
        } else if (typeof companyData === 'string') {
            accountName = companyData
        }
    }
    
    // If we have an Attio company record ID, look up the Apollo account ID
    if (attioCompanyRecordId) {
        console.log(`[Deal Sync] Looking up Apollo account ID for Attio company record: ${attioCompanyRecordId}`)
        try {
            const {default: getApolloOrganizationId} = await import("./get-apollo-organization-id.server")
            accountId = await getApolloOrganizationId(attioCompanyRecordId)
            if (accountId) {
                console.log(`[Deal Sync] Found Apollo account ID: ${accountId} for Attio company ${attioCompanyRecordId}`)
            } else {
                console.log(`[Deal Sync] No Apollo account found for Attio company ${attioCompanyRecordId}, will use account_name instead`)
            }
        } catch (error) {
            console.warn(`[Deal Sync] Failed to look up Apollo account ID for Attio company ${attioCompanyRecordId}:`, error)
            // Continue without account_id - will use account_name instead
        }
    }
    
    console.log(`[Deal Sync] Extracted data from Attio:`, {
        name: dealName,
        amount,
        attioStage,
        account_name: accountName,
    })
    
    // Step 2: Search for opportunity in Apollo by deal name
    // Try exact name match first, then fallback to keyword search
    console.log(`[Deal Sync] Searching for opportunity in Apollo by name: ${dealName}`)
    let apolloOpps = await searchApolloOpportunities({
        name: dealName,
        per_page: 20, // Get more results to find exact match
    })
    
    // If no results with name parameter, try q_keywords
    if (apolloOpps.length === 0) {
        console.log(`[Deal Sync] No results with name parameter, trying q_keywords: ${dealName}`)
        apolloOpps = await searchApolloOpportunities({
            q_keywords: dealName,
            per_page: 20,
        })
    }
    
    // Find match - prioritize Attio record ID in description, then exact name match
    // CRITICAL: Only match on exact criteria - don't use first result as fallback
    // This prevents different Attio deals from syncing to the same Apollo deal
    
    // First, try to match by Attio record ID in description (most reliable)
    const attioRecordIdMarker = `[Attio Record ID: ${recordId}]`
    let matchedOpp = apolloOpps.find(opp => {
        if (opp.description && opp.description.includes(attioRecordIdMarker)) {
            console.log(`[Deal Sync] Found match by Attio record ID in description: "${opp.name}" (ID: ${opp.id})`)
            return true
        }
        return false
    })
    
    // If no match by record ID, try exact name match (case-insensitive)
    // Also consider account_id if available for more robust matching
    if (!matchedOpp) {
        matchedOpp = apolloOpps.find(opp => {
            const nameMatch = opp.name && opp.name.toLowerCase().trim() === dealName.toLowerCase().trim()
            if (!nameMatch) return false
            
            // If we have an account_id, also verify it matches (if Apollo opportunity has one)
            if (accountId && opp.account_id) {
                const accountMatch = opp.account_id === accountId
                if (accountMatch) {
                    console.log(`[Deal Sync] Found match with both name and account_id: "${opp.name}" (ID: ${opp.id}, Account: ${opp.account_id})`)
                    return true
                }
                // Name matches but account doesn't - this could be a different deal with same name
                // Log a warning but still match on name only
                console.warn(`[Deal Sync] Name matches but account_id differs. Attio account: ${accountId}, Apollo account: ${opp.account_id}`)
            }
            
            return true
        })
    }
    
    if (matchedOpp) {
        console.log(`[Deal Sync] Found exact name match: "${matchedOpp.name}" (ID: ${matchedOpp.id})`)
    } else if (apolloOpps.length > 0) {
        console.log(`[Deal Sync] No exact name match found. Found ${apolloOpps.length} similar deals, but will create new deal to avoid overwriting wrong record.`)
        console.log(`[Deal Sync] Similar deals found:`, apolloOpps.slice(0, 3).map(opp => `${opp.name} (ID: ${opp.id})`))
    }
    
    if (matchedOpp) {
        // Step 3: Update existing Apollo opportunity
        const existingOpp = matchedOpp
        const oppId = existingOpp.id
        
        if (!oppId) {
            throw new Error(`Found Apollo opportunity but missing ID`)
        }
        
        console.log(`[Deal Sync] Found existing Apollo opportunity ${oppId}, updating...`)
        
        const updateData: {
            name?: string
            account_id?: string | null
            account_name?: string | null
            amount?: number | null
            stage_name?: string | null
            stage_id?: string | null
            probability?: number | null
            close_date?: string | null
            description?: string | null
        } = {}
        
        // Always update name if available
        if (dealName) {
            updateData.name = dealName
            console.log(`[Deal Sync] Including name in update: "${dealName}"`)
        }
        
        // Update account association
        if (accountId) {
            updateData.account_id = accountId
            console.log(`[Deal Sync] Including account_id in update: "${accountId}"`)
        } else if (accountName) {
            updateData.account_name = accountName
            console.log(`[Deal Sync] Including account_name in update: "${accountName}"`)
        }
        
        // Update amount (always include if not null, even if 0)
        if (amount !== null && amount !== undefined) {
            updateData.amount = amount
            console.log(`[Deal Sync] Including amount in update: ${amount}`)
        } else {
            console.log(`[Deal Sync] No amount to sync (amount: ${amount})`)
        }
        
        // Apollo uses "stage_id" for the stage field (preferred) or "stage_name" as fallback
        // Try to map the stage name to an Apollo stage ID first
        if (attioStage) {
            try {
                const stageId = await mapDealStageToApollo(attioStage)
                if (stageId && typeof stageId === 'string' && stageId.length > 20 && /^[a-zA-Z0-9]+$/.test(stageId)) {
                    // It's a valid Apollo stage ID, use stage_id
                    updateData.stage_id = stageId
                    console.log(`[Deal Sync] Including stage_id in update: "${stageId}" (mapped from "${attioStage}")`)
                } else {
                    // Mapping failed or returned a non-ID value - use stage_name as fallback
                    // This ensures the stage still syncs even if we can't find the exact ID
                    updateData.stage_name = attioStage
                    if (stageId === null) {
                        console.warn(`[Deal Sync] Stage mapping failed for "${attioStage}" - using stage_name as fallback`)
                    } else {
                        console.log(`[Deal Sync] Using stage_name: "${attioStage}" (could not find stage_id)`)
                    }
                }
            } catch (error) {
                // If mapping fails with exception, use stage_name as fallback
                console.error(`[Deal Sync] Stage mapping error for "${attioStage}":`, error)
                console.log(`[Deal Sync] Using stage_name as fallback: "${attioStage}"`)
                updateData.stage_name = attioStage
            }
        } else {
            console.log(`[Deal Sync] No stage to sync (attioStage: ${attioStage})`)
        }
        
        // Update probability
        if (probability !== null && probability !== undefined) {
            updateData.probability = probability
            console.log(`[Deal Sync] Including probability in update: ${probability}`)
        } else {
            console.log(`[Deal Sync] No probability to sync (probability: ${probability})`)
        }
        
        // Update close date
        if (closeDate) {
            updateData.close_date = closeDate
            console.log(`[Deal Sync] Including close_date in update: "${closeDate}"`)
        } else {
            console.log(`[Deal Sync] No close_date to sync (closeDate: ${closeDate})`)
        }
        
        // Update description - include Attio record ID for future matching
        const attioRecordIdMarker = `[Attio Record ID: ${recordId}]`
        if (description) {
            // Check if description already contains the Attio record ID marker
            if (!description.includes(attioRecordIdMarker)) {
                updateData.description = `${description}\n\n${attioRecordIdMarker}`
            } else {
                updateData.description = description
            }
            console.log(`[Deal Sync] Including description in update: "${updateData.description.substring(0, 50)}..."`)
        } else {
            // Even if no description, add the Attio record ID for future matching
            updateData.description = attioRecordIdMarker
            console.log(`[Deal Sync] Adding Attio record ID marker to description: ${attioRecordIdMarker}`)
        }
        
        console.log(`[Deal Sync] Final update data being sent to Apollo:`, JSON.stringify(updateData, null, 2))
        
        const updatedOpp = await updateApolloOpportunity(oppId, updateData)
        
        console.log(`[Deal Sync] Apollo opportunity updated successfully:`, {
            id: updatedOpp.id,
            name: updatedOpp.name,
        })
        
        return {created: 0, updated: 1}
    } else {
        // Step 4: Create new opportunity in Apollo
        console.log(`[Deal Sync] Opportunity not found in Apollo, creating new opportunity...`)
        
        // Include Attio record ID in description for future matching
        const attioRecordIdMarker = `[Attio Record ID: ${recordId}]`
        const descriptionWithMarker = description 
            ? `${description}\n\n${attioRecordIdMarker}`
            : attioRecordIdMarker
        
        const newOpp = await createApolloOpportunity({
            name: dealName,
            account_id: accountId,
            account_name: accountName,
            amount: amount,
            stage_name: attioStage || undefined,
            probability: probability,
            close_date: closeDate,
            description: descriptionWithMarker,
        })
        
        console.log(`[Deal Sync] Apollo opportunity created successfully:`, {
            id: newOpp.id,
            name: newOpp.name,
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
        // For select/dropdown fields, check option.title first
        if (entry?.option?.title) {
            return String(entry.option.title).trim()
        }
        // For text fields, check value
        if (entry?.value !== undefined && entry?.value !== null) {
            return String(entry.value).trim()
        }
        // Fallback to other common fields
        if (entry?.title) {
            return String(entry.title).trim()
        }
        if (entry?.name) {
            return String(entry.name).trim()
        }
        if (entry?.label) {
            return String(entry.label).trim()
        }
        return null
    }
    
    if (typeof attioData === 'string') {
        return attioData.trim()
    }
    
    if (typeof attioData === 'number') {
        return String(attioData)
    }
    
    if (typeof attioData === 'object' && attioData !== null) {
        const obj = attioData as Record<string, unknown>
        if (obj.option && typeof obj.option === 'object' && obj.option !== null) {
            const option = obj.option as Record<string, unknown>
            if (option.title) {
                return String(option.title).trim()
            }
        }
        if (obj.value !== undefined && obj.value !== null) {
            return String(obj.value).trim()
        }
        if (obj.title) {
            return String(obj.title).trim()
        }
        if (obj.name) {
            return String(obj.name).trim()
        }
        if (obj.label) {
            return String(obj.label).trim()
        }
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
        // For currency attribute type, use currency_value
        if (entry?.attribute_type === 'currency' && entry?.currency_value !== undefined && entry?.currency_value !== null) {
            const num = Number(entry.currency_value)
            if (!isNaN(num)) {
                console.log(`[Deal Sync] Extracted amount from currency_value: ${num}`)
                return num
            }
        }
        // Try value field
        if (entry?.value !== undefined && entry?.value !== null) {
            const num = Number(entry.value)
            if (!isNaN(num)) {
                return num
            }
        }
        // Try numeric_value field (some Attio fields use this)
        if (entry?.numeric_value !== undefined && entry?.numeric_value !== null) {
            const num = Number(entry.numeric_value)
            if (!isNaN(num)) {
                return num
            }
        }
        // Try amount field within the entry
        if (entry?.amount !== undefined && entry?.amount !== null) {
            const num = Number(entry.amount)
            if (!isNaN(num)) {
                return num
            }
        }
    }
    
    if (typeof attioData === 'number') {
        return attioData
    }
    
    if (typeof attioData === 'string') {
        // Remove currency symbols and commas
        const cleaned = attioData.replace(/[$,€£¥]/g, '').replace(/,/g, '').trim()
        const num = Number(cleaned)
        if (!isNaN(num)) {
            return num
        }
    }
    
    // If it's an object, try to extract numeric value
    if (typeof attioData === 'object' && attioData !== null) {
        const obj = attioData as Record<string, unknown>
        // For currency attribute type, use currency_value
        if (obj.attribute_type === 'currency' && obj.currency_value !== undefined && obj.currency_value !== null) {
            const num = Number(obj.currency_value)
            if (!isNaN(num)) {
                return num
            }
        }
        if (obj.value !== undefined && obj.value !== null) {
            const num = Number(obj.value)
            if (!isNaN(num)) {
                return num
            }
        }
        if (obj.numeric_value !== undefined && obj.numeric_value !== null) {
            const num = Number(obj.numeric_value)
            if (!isNaN(num)) {
                return num
            }
        }
        if (obj.amount !== undefined && obj.amount !== null) {
            const num = Number(obj.amount)
            if (!isNaN(num)) {
                return num
            }
        }
    }
    
    return null
}

