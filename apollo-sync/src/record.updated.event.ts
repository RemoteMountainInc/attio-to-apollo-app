import syncToApollo from "./sync-to-apollo.server"

/**
 * Automatically sync to Apollo when a person record is updated in Attio
 * This event handler is triggered automatically when any person record is updated
 */
export default async function onRecordUpdated(event: {
    object: string
    recordId: string
}) {
    console.log(`[Event Handler] Record updated event received:`, {
        object: event.object,
        recordId: event.recordId,
    })
    
    // Only sync people records
    if (event.object !== "people") {
        console.log(`[Event Handler] Skipping sync - not a people record (object: ${event.object})`)
        return
    }

    try {
        console.log(`[Event Handler] Starting automatic sync to Apollo for record ${event.recordId}`)
        
        // Add a small delay to ensure the Attio update is fully persisted
        // This helps ensure we read the latest data
        console.log(`[Event Handler] Waiting 500ms for Attio update to persist...`)
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Sync the updated record to Apollo
        const result = await syncToApollo(event.recordId)
        console.log(`[Event Handler] Successfully synced record ${event.recordId} to Apollo:`, result)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : undefined
        console.error(`[Event Handler] Error syncing record ${event.recordId} to Apollo:`, {
            message: errorMessage,
            stack: errorStack,
            error: error,
        })
        // Don't throw - we don't want to block the record update if sync fails
    }
}

