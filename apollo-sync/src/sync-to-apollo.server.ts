import {getPerson} from "./attio-api.server"
import {searchApolloContacts, createApolloContact, updateApolloContact} from "./apollo-api.server"
import {mapStageToApollo, validateStageMapping} from "./stage-mapping.server"
import {extractAttioAttributes} from "./attribute-mapping.server"

/**
 * Sync a single Attio person record to Apollo
 * 
 * This function:
 * 1. Fetches the latest data from Attio
 * 2. Searches for the contact in Apollo by email
 * 3. Updates existing contact or creates new one
 * 
 * @param recordId - The Attio person record ID
 * @returns Object with created and updated counts
 */
export default async function syncToApollo(recordId: string): Promise<{created: number; updated: number}> {
    console.log(`[Sync] Starting sync to Apollo for record ${recordId}`)
    
    // Step 1: Fetch the latest person record from Attio
    console.log(`[Sync] Fetching person record from Attio...`)
    const attioRecord = await getPerson(recordId)
    
    if (!attioRecord?.data) {
        throw new Error(`Failed to fetch Attio record ${recordId}`)
    }
    
    const recordData = attioRecord.data
    
    // Log the full response structure to see where data might be stored
    console.error(`[Sync] ===== FULL ATTIO RECORD STRUCTURE =====`)
    console.error(`[Sync] Record data keys:`, Object.keys(recordData))
    console.error(`[Sync] Full record data (first 5000 chars):`, JSON.stringify(recordData, null, 2).substring(0, 5000))
    
    const values = recordData.values || {}
    
    // Log ALL available keys to see what Attio returns
    console.error(`[Sync] ===== DEBUGGING ATTIO VALUES =====`)
    const allKeys = Object.keys(values)
    console.error(`[Sync] All available keys in values (${allKeys.length}):`, allKeys)
    console.error(`[Sync] Full values object (first 5000 chars):`, JSON.stringify(values, null, 2).substring(0, 5000))
    console.log(`[Sync] All available keys in values:`, allKeys)
    
    // Also check if attributes are stored separately
    const attributes = recordData.attributes || recordData.attribute_values || {}
    if (Object.keys(attributes).length > 0) {
        console.error(`[Sync] Found attributes object with keys:`, Object.keys(attributes))
        console.error(`[Sync] Attributes:`, JSON.stringify(attributes, null, 2).substring(0, 2000))
    }
    
    // Check for status field - try multiple variations
    // The field might be stored as: status, Status, or with the attribute ID as key
    const statusField = values.status || values.Status || values["status"] || values["Status"]
    
    // Also check if it's stored with the attribute ID as the key
    // User provided attribute ID: 0357b938-75b6-4dc2-ab04-ff5fe6f4d9d6
    const statusById = values["0357b938-75b6-4dc2-ab04-ff5fe6f4d9d6"]
    
    if (statusField !== undefined) {
        console.error(`[Sync] FOUND status field (by name)!`, JSON.stringify(statusField, null, 2))
        console.log(`[Sync] FOUND status field (by name)!`, JSON.stringify(statusField, null, 2))
    } else if (statusById !== undefined) {
        console.error(`[Sync] FOUND status field (by ID)!`, JSON.stringify(statusById, null, 2))
        console.log(`[Sync] FOUND status field (by ID)!`, JSON.stringify(statusById, null, 2))
    } else {
        console.error(`[Sync] status field NOT FOUND in values`)
        console.log(`[Sync] status field NOT FOUND in values`)
        // Log all keys that might be related
        for (const key of allKeys) {
            console.error(`[Sync] Key "${key}":`, typeof values[key], Array.isArray(values[key]) ? 'array' : '')
        }
    }
    
    // Extract email - required for sync
    const emailAddresses = values.email_addresses || []
    const email = emailAddresses[0]?.email_address
    
    if (!email) {
        throw new Error(`No email address found for record ${recordId}. Email is required for syncing.`)
    }
    
    // Extract name from Attio record
    // CRITICAL: Attio stores name as an ARRAY of name objects, not a single object!
    // Format: values.name = [{ first_name: "...", last_name: "...", ... }]
    const nameData = values.name
    
    let firstName: string | null = null
    let lastName: string | null = null
    
    if (Array.isArray(nameData) && nameData.length > 0) {
        // Get the first (most recent) name entry
        const nameEntry = nameData[0]
        firstName = nameEntry?.first_name || null
        lastName = nameEntry?.last_name || null
        console.log(`[Sync] Name is an array, extracted from first entry:`, {
            first_name: firstName,
            last_name: lastName,
        })
    } else if (nameData && typeof nameData === 'object' && !Array.isArray(nameData)) {
        // Fallback: handle as object (legacy format)
        firstName = nameData.first_name || null
        lastName = nameData.last_name || null
        console.log(`[Sync] Name is an object, extracted:`, {
            first_name: firstName,
            last_name: lastName,
        })
    } else {
        console.log(`[Sync] Name data is null/undefined or unexpected format`)
    }
    
    console.log(`[Sync] Raw name data from Attio:`, JSON.stringify(nameData, null, 2))
    console.log(`[Sync] Final extracted values:`, {
        firstName,
        lastName,
        firstNameType: typeof firstName,
        lastNameType: typeof lastName,
    })
    
    // Extract stage from Attio
    // CRITICAL: Attio stores custom attributes (like Stage) as object references with IDs
    // The Stage might be stored as: { id: "0357b938-75b6-4dc2-ab04-ff5fe6f4d9d6", title: "Stage Name" }
    // or as an array: [{ id: "...", title: "..." }]
    // The field name might be the attribute slug (e.g., "status") not "Stage"
    let attioStage: string | null = null
    let attioStageName: string | null = null
    
    // Try multiple possible field names and formats
    // IMPORTANT: Check for "status" slug as well (user confirmed the stage attribute slug is "status")
    // Also check for attribute ID: 0357b938-75b6-4dc2-ab04-ff5fe6f4d9d6
    // Check in order: status (slug), Status, attribute ID, Stage, stage, lifecycle_stage
    // Also check in attributes object if it exists
    let stageData = values.status || 
                    values.Status || 
                    values["status"] || 
                    values["Status"] || 
                    values["0357b938-75b6-4dc2-ab04-ff5fe6f4d9d6"] || // Attribute ID
                    values.Stage || 
                    values.stage || 
                    values.lifecycle_stage || 
                    values["Stage"] || 
                    values["stage"]
    
    // If not found in values, check attributes object
    if (!stageData && Object.keys(attributes).length > 0) {
        stageData = attributes.status || 
                    attributes.Status || 
                    attributes["status"] || 
                    attributes["Status"] || 
                    attributes["0357b938-75b6-4dc2-ab04-ff5fe6f4d9d6"] ||
                    attributes.Stage ||
                    attributes.stage
        if (stageData) {
            console.error(`[Sync] Found stage in attributes object!`)
        }
    }
    
    console.error(`[Sync] Checking for stage field...`)
    console.error(`[Sync] values.status:`, values.status)
    console.error(`[Sync] values.Status:`, values.Status)
    console.error(`[Sync] values["0357b938-75b6-4dc2-ab04-ff5fe6f4d9d6"]:`, values["0357b938-75b6-4dc2-ab04-ff5fe6f4d9d6"])
    console.error(`[Sync] values.Stage:`, values.Stage)
    console.error(`[Sync] stageData found:`, !!stageData, typeof stageData)
    
    if (stageData) {
        console.error(`[Sync] FOUND STAGE DATA!`)
        console.error(`[Sync] Raw Stage data from Attio:`, JSON.stringify(stageData, null, 2))
        console.log(`[Sync] Raw Stage data from Attio:`, JSON.stringify(stageData, null, 2))
        console.log(`[Sync] Stage data type:`, typeof stageData, `isArray:`, Array.isArray(stageData))
        
        if (Array.isArray(stageData) && stageData.length > 0) {
            // If it's an array, get the first entry
            const stageEntry = stageData[0]
            console.log(`[Sync] Stage array entry:`, JSON.stringify(stageEntry, null, 2))
            
            // For Attio select attributes, the structure is:
            // { option: { title: "Third-Party", id: { option_id: "..." } } }
            // Check option.title FIRST (this is the actual stage name)
            if (stageEntry?.option?.title) {
                attioStageName = stageEntry.option.title
                const stageId = stageEntry.option.id?.option_id || null
                console.log(`[Sync] Extracted from option.title: "${attioStageName}" (ID: ${stageId})`)
            } else {
                // Fallback: Check for title (name) or value field - these are the common fields for object references
                // Attio object references typically have: { id: "...", title: "..." } or { record_id: "...", title: "..." }
                attioStageName = stageEntry?.title || stageEntry?.name || stageEntry?.value || stageEntry?.label || null
                // Also get the ID if available
                const stageId = stageEntry?.id || stageEntry?.record_id || null
                console.log(`[Sync] Extracted from fallback fields: "${attioStageName}" (ID: ${stageId})`)
            }
            
            // If we only have an ID and no name, we might need to look it up
            // But for now, if we have a title/name, use that
        } else if (typeof stageData === 'object' && stageData !== null) {
            // It's an object - could be { option: { title: "..." } } or { id: "...", title: "..." }
            console.log(`[Sync] Stage object keys:`, Object.keys(stageData))
            console.log(`[Sync] Stage object full:`, JSON.stringify(stageData, null, 2))
            
            // Declare stageId at this scope
            let stageId: string | null = null
            
            // For Attio select attributes, check option.title FIRST
            if (stageData.option?.title) {
                attioStageName = stageData.option.title
                stageId = stageData.option.id?.option_id || null
                console.log(`[Sync] Extracted from option.title (object): "${attioStageName}" (ID: ${stageId})`)
            } else {
                // Fallback: Attio object references typically have 'title' for the display name
                attioStageName = stageData.title || stageData.name || stageData.value || stageData.label || null
                stageId = stageData.id || stageData.record_id || null
                console.log(`[Sync] Extracted from fallback fields (object): "${attioStageName}" (ID: ${stageId})`)
            }
            
            // If we have an ID but no name, log a warning
            if (stageId && !attioStageName) {
                console.warn(`[Sync] Found stage ID ${stageId} but no name/title. May need to look up the name.`)
            }
        } else if (typeof stageData === 'string') {
            // Direct string value - could be the ID or the name
            // If it looks like a UUID, it's probably an ID
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stageData)) {
                console.log(`[Sync] Stage appears to be an ID (UUID):`, stageData)
                console.warn(`[Sync] Stage is a UUID ID. Need to look up the name from Attio.`)
                // We have the ID but need the name - for now, use the ID and let mapping handle it
                attioStageName = stageData
            } else {
                // It's a name
                attioStageName = stageData
                console.log(`[Sync] Stage is string (name):`, attioStageName)
            }
        }
    } else {
        console.log(`[Sync] No Stage data found. Checked: status, Status, Stage, stage, lifecycle_stage`)
        console.log(`[Sync] All values keys:`, Object.keys(values))
        // Try to find any field that might be stage-related
        for (const key of Object.keys(values)) {
            const keyLower = key.toLowerCase()
            if (keyLower.includes('stage') || keyLower.includes('lifecycle') || keyLower === 'status') {
                const stageValue = values[key]
                console.log(`[Sync] Found potential stage field "${key}":`, JSON.stringify(stageValue, null, 2))
                
                // If we found something, try to extract it
                if (stageValue && !attioStageName) {
                    if (Array.isArray(stageValue) && stageValue.length > 0) {
                        const entry = stageValue[0]
                        // Check option.title FIRST for select attributes
                        attioStageName = entry?.option?.title || entry?.title || entry?.name || entry?.value || entry?.label || null
                        console.log(`[Sync] Extracted from array:`, attioStageName)
                    } else if (typeof stageValue === 'object' && stageValue !== null) {
                        // Check for select attribute format: { option: { title: "..." } } FIRST
                        // Then fallback to object reference format: { id: "...", title: "..." }
                        attioStageName = stageValue.option?.title || stageValue.title || stageValue.name || stageValue.value || stageValue.label || null
                        const stageId = stageValue.option?.id?.option_id || stageValue.id || stageValue.record_id || null
                        console.log(`[Sync] Extracted from object:`, { id: stageId, name: attioStageName })
                    } else if (typeof stageValue === 'string') {
                        attioStageName = stageValue
                        console.log(`[Sync] Extracted from string:`, attioStageName)
                    }
                }
            }
        }
    }
    
    // Use the stage name for mapping
    attioStage = attioStageName
    
    console.log(`[Sync] Final extracted stage name:`, attioStage, `(type: ${typeof attioStage})`)
    
    // Map Attio stage to Apollo stage ID (async function)
    let apolloStage: string | null | undefined = null
    if (attioStage) {
        apolloStage = await mapStageToApollo(attioStage)
        console.log(`[Sync] Mapped Attio stage "${attioStage}" to Apollo stage: "${apolloStage}"`)
        
        // Validate mapping
        const validation = await validateStageMapping(attioStage, null)
        if (!validation.isValid) {
            console.warn(`[Sync] Stage mapping validation:`, validation.warnings)
        }
    }
    
    // Extract all additional attributes from Attio
    const additionalAttributes = extractAttioAttributes(values)
    console.log(`[Sync] Extracted additional attributes from Attio:`, additionalAttributes)
    
    console.log(`[Sync] Extracted data from Attio:`, {
        email,
        firstName,
        lastName,
        attioStage,
        apolloStage,
        ...additionalAttributes,
    })
    
    // Step 2: Search for contact in Apollo by email
    console.log(`[Sync] Searching for contact in Apollo by email: ${email}`)
    const apolloContacts = await searchApolloContacts({
        q_keywords: email,
        per_page: 1,
    })
    
    if (apolloContacts.length > 0) {
        // Step 3: Update existing Apollo contact
        const existingContact = apolloContacts[0]
        const contactId = existingContact.id
        
        if (!contactId) {
            throw new Error(`Found Apollo contact but missing ID`)
        }
        
        console.log(`[Sync] Found existing Apollo contact ${contactId}, updating...`)
        console.log(`[Sync] Current Apollo values:`, {
            first_name: existingContact.first_name,
            last_name: existingContact.last_name,
            stage: existingContact.lifecycle_stage || existingContact.stage,
        })
        console.log(`[Sync] New values from Attio:`, {
            first_name: firstName,
            last_name: lastName,
            stage: apolloStage,
            firstNameType: typeof firstName,
            lastNameType: typeof lastName,
        })
        
        // CRITICAL: Always pass first_name and last_name explicitly, even if null
        // This tells Apollo to update these fields
        // Include all additional attributes from Attio
        const updateData: {
            email: string
            first_name?: string | null
            last_name?: string | null
            stage?: string | null
            title?: string | null
            organization_name?: string | null
            // phone_numbers removed - not syncing to avoid errors
            linkedin_url?: string | null
            twitter_url?: string | null
            facebook_url?: string | null
            instagram_url?: string | null
            bio?: string | null
        } = {
            email: email,
        }
        
        // Always include first_name if we have it from Attio (even if null/empty)
        if (firstName !== undefined) {
            updateData.first_name = firstName
        }
        
        // Always include last_name if we have it from Attio (even if null/empty)
        if (lastName !== undefined) {
            updateData.last_name = lastName
        }
        
        // Include stage if we have it - ALWAYS include if we have a value
        if (apolloStage !== null && apolloStage !== undefined && apolloStage !== "") {
            updateData.stage = apolloStage
            console.log(`[Sync] Including stage in update: "${apolloStage}"`)
            console.error(`[Sync] Including stage in update: "${apolloStage}"`)
        } else {
            console.log(`[Sync] No stage to sync (apolloStage: ${apolloStage}, type: ${typeof apolloStage})`)
            console.error(`[Sync] No stage to sync (apolloStage: ${apolloStage}, type: ${typeof apolloStage})`)
        }
        
        // Include all additional attributes
        if (additionalAttributes.title !== null && additionalAttributes.title !== undefined) {
            updateData.title = additionalAttributes.title
        }
        if (additionalAttributes.organization_name !== null && additionalAttributes.organization_name !== undefined) {
            updateData.organization_name = additionalAttributes.organization_name
        }
        // Phone numbers removed - not syncing to avoid errors
        if (additionalAttributes.linkedin_url !== null && additionalAttributes.linkedin_url !== undefined) {
            updateData.linkedin_url = additionalAttributes.linkedin_url
        }
        if (additionalAttributes.twitter_url !== null && additionalAttributes.twitter_url !== undefined) {
            updateData.twitter_url = additionalAttributes.twitter_url
        }
        if (additionalAttributes.facebook_url !== null && additionalAttributes.facebook_url !== undefined) {
            updateData.facebook_url = additionalAttributes.facebook_url
        }
        if (additionalAttributes.instagram_url !== null && additionalAttributes.instagram_url !== undefined) {
            updateData.instagram_url = additionalAttributes.instagram_url
        }
        if (additionalAttributes.bio !== null && additionalAttributes.bio !== undefined) {
            updateData.bio = additionalAttributes.bio
        }
        
        console.log(`[Sync] Update data being sent to Apollo:`, JSON.stringify(updateData, null, 2))
        console.error(`[Sync] Update data being sent to Apollo:`, JSON.stringify(updateData, null, 2))
        
        // Verify stage is included
        if (updateData.stage) {
            console.log(`[Sync] Stage is included in updateData: "${updateData.stage}"`)
            console.error(`[Sync] Stage is included in updateData: "${updateData.stage}"`)
        } else {
            console.error(`[Sync] Stage is MISSING from updateData! apolloStage was: "${apolloStage}"`)
        }
        
        // Update the contact in Apollo
        const updatedContact = await updateApolloContact(contactId, updateData)
        
        console.log(`[Sync] ===== SYNC TO APOLLO COMPLETE =====`)
        console.log(`[Sync] Apollo contact updated successfully:`, {
            id: updatedContact.id,
            first_name: updatedContact.first_name,
            last_name: updatedContact.last_name,
            lifecycle_stage: updatedContact.lifecycle_stage,
            updated_at: (updatedContact as any).updated_at,
        })
        
        // Verify by fetching the contact again after a short delay
        console.log(`[Sync] Verifying update by fetching contact again...`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        const verifyContacts = await searchApolloContacts({
            q_keywords: email,
            per_page: 1,
        })
        
        if (verifyContacts.length > 0) {
            const verified = verifyContacts[0]
            console.log(`[Sync] Verified contact in Apollo:`, {
                first_name: verified.first_name,
                last_name: verified.last_name,
                lifecycle_stage: verified.lifecycle_stage,
            })
            
            if (verified.first_name === updatedContact.first_name) {
                console.log(`[Sync] VERIFICATION SUCCESSFUL: Contact is updated in Apollo!`)
            }
        }
        
        return {created: 0, updated: 1}
    } else {
        // Step 4: Create new contact in Apollo
        console.log(`[Sync] Contact not found in Apollo, creating new contact...`)
        
        const newContact = await createApolloContact({
            email: email,
            first_name: firstName,
            last_name: lastName,
            stage: apolloStage,
            title: additionalAttributes.title || null,
            organization_name: additionalAttributes.organization_name || null,
            // phone_numbers removed - not syncing to avoid errors
            linkedin_url: additionalAttributes.linkedin_url || null,
            twitter_url: additionalAttributes.twitter_url || null,
            facebook_url: additionalAttributes.facebook_url || null,
            instagram_url: additionalAttributes.instagram_url || null,
            bio: additionalAttributes.bio || null,
        })
        
        console.log(`[Sync] Apollo contact created successfully:`, {
            id: newContact.id,
            email: newContact.email,
            first_name: newContact.first_name,
            last_name: newContact.last_name,
        })
        
        return {created: 1, updated: 0}
    }
}
