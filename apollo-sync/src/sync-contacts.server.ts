import {getWorkspaceConnection} from "attio/server"
import {searchApolloContacts} from "./apollo-api.server"
// import {createApolloContact, updateApolloContact} from "./apollo-api.server" // Unused

export async function syncFromApollo(): Promise<{created: number; updated: number}> {
    try {
        const connection = getWorkspaceConnection()
        if (!connection || !connection.value) {
            throw new Error("Apollo connection not configured")
        }
    } catch (error) {
        throw new Error("Apollo connection not configured. Please set up the Apollo connection in app settings.")
    }

    const contacts = await searchApolloContacts({per_page: 10, page: 1})
    let created = 0
    let updated = 0

    // Note: This would need to use Attio API to create/update records
    // For now, this is a placeholder structure
    for (const contact of contacts) {
        if (!contact.email) continue
        // TODO: Implement Attio API calls to create/update people records
    }

    return {created, updated}
}

export async function syncToApollo(): Promise<{created: number; updated: number}> {
    try {
        const connection = getWorkspaceConnection()
        if (!connection || !connection.value) {
            throw new Error("Apollo connection not configured")
        }
    } catch (error) {
        throw new Error("Apollo connection not configured. Please set up the Apollo connection in app settings.")
    }

    // TODO: Get Attio contacts and sync to Apollo
    return {created: 0, updated: 0}
}

