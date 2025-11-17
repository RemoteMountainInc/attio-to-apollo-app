import {searchApolloContacts} from "./apollo-api.server"
import {getPerson, updatePerson} from "./attio-api.server"
import {mapStageToAttio, validateStageMapping} from "./stage-mapping.server"

/**
 * Sync a single Apollo contact to Attio
 * 
 * This function:
 * 1. Fetches the current Attio record to get the email
 * 2. Searches for the contact in Apollo by email
 * 3. Updates the Attio record with Apollo data
 * 
 * @param recordId - The Attio person record ID
 * @returns Object with created and updated counts
 */
export default async function syncFromApollo(recordId: string): Promise<{created: number; updated: number}> {
    console.log(`[Sync] Starting sync from Apollo for record ${recordId}`)
    
    // Step 1: Get the current Attio record to find the email
    console.log(`[Sync] Fetching person record from Attio...`)
    const attioRecord = await getPerson(recordId)
    
    if (!attioRecord?.data) {
        throw new Error(`Failed to fetch Attio record ${recordId}`)
    }
    
    const recordData = attioRecord.data
    const values = recordData.values || {}
    
    // Extract email - required for searching Apollo
    const emailAddresses = values.email_addresses || []
    const email = emailAddresses[0]?.email_address
    
    if (!email) {
        throw new Error(`No email address found for record ${recordId}. Email is required for syncing.`)
    }
    
    // Step 2: Search for contact in Apollo by email
    console.log(`[Sync] Searching for contact in Apollo by email: ${email}`)
    const apolloContacts = await searchApolloContacts({
        q_keywords: email,
        per_page: 1,
    })
    
    if (apolloContacts.length === 0) {
        throw new Error(`Contact with email ${email} not found in Apollo`)
    }
    
    const apolloContact = apolloContacts[0]
    
    // Extract data from Apollo contact
    const apolloFirstName = apolloContact.first_name || null
    const apolloLastName = apolloContact.last_name || null
    // Apollo can have stage as contact_stage_id (ID), lifecycle_stage (name), or stage (name)
    const apolloStageRaw = apolloContact.contact_stage_id || apolloContact.lifecycle_stage || apolloContact.stage || null
    
    // Map Apollo stage to Attio stage format (async function)
    let attioStage: string | null = null
    if (apolloStageRaw) {
        attioStage = await mapStageToAttio(apolloStageRaw) || null
        console.log(`[Sync] Mapped Apollo stage "${apolloStageRaw}" to Attio stage: "${attioStage}"`)
        
        // Validate mapping
        const validation = await validateStageMapping(null, apolloStageRaw)
        if (!validation.isValid) {
            console.warn(`[Sync] Stage mapping validation:`, validation.warnings)
        }
    }
    
    console.log(`[Sync] Extracted data from Apollo:`, {
        email,
        first_name: apolloFirstName,
        last_name: apolloLastName,
        apolloStage: apolloStageRaw,
        attioStage,
    })
    
    // Step 3: Update the Attio record with Apollo data
    console.log(`[Sync] Updating Attio record with Apollo data...`)
    await updatePerson(recordId, {
        email: email,
        first_name: apolloFirstName,
        last_name: apolloLastName,
        stage: attioStage,
    })
    
    console.log(`[Sync] Attio record updated successfully`)
    
    return {created: 0, updated: 1}
}
