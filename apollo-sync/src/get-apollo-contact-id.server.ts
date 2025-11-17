import {getPerson} from "./attio-api.server"
import {searchApolloContacts} from "./apollo-api.server"

/**
 * Get Apollo contact ID for an Attio record
 * Searches Apollo by email to find the contact ID
 */
export default async function getApolloContactId(recordId: string): Promise<string | null> {
    // Fetch the Attio record to get the email
    const attioRecord = await getPerson(recordId)
    
    if (!attioRecord?.data) {
        throw new Error(`Failed to fetch Attio record ${recordId}`)
    }
    
    const values = attioRecord.data.values || {}
    const emailAddresses = values.email_addresses || []
    const email = emailAddresses[0]?.email_address
    
    if (!email) {
        throw new Error(`No email address found for record ${recordId}. Email is required to find Apollo contact.`)
    }
    
    // Search for contact in Apollo by email
    const apolloContacts = await searchApolloContacts({
        q_keywords: email,
        per_page: 1,
    })
    
    if (apolloContacts.length > 0 && apolloContacts[0].id) {
        return apolloContacts[0].id
    }
    
    return null
}

