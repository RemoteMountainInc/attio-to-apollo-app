import {ATTIO_API_TOKEN} from "attio/server"
import {searchApolloAccounts, searchApolloContacts} from "./apollo-api.server"

const ATTIO_API_BASE = "https://api.attio.com"

/**
 * Find Apollo organization ID by searching for contacts associated with the company
 * This is a fallback method when domain/name matching doesn't work
 */
export async function findCompanyViaContacts(companyRecordId: string): Promise<string | null> {
    console.log(`[Find Company Via Contacts] Searching for company ${companyRecordId} via associated contacts...`)
    
    try {
        // Query Attio to find people records associated with this company
        // Try different filter formats for company association
        let response = await fetch(`${ATTIO_API_BASE}/v2/objects/people/records/query`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${ATTIO_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                filter: {
                    attribute: "company",
                    relation: "references",
                    value: companyRecordId,
                },
                limit: 10,
            }),
        })
        
        // If that doesn't work, try alternative filter format
        if (!response.ok) {
            response = await fetch(`${ATTIO_API_BASE}/v2/objects/people/records/query`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${ATTIO_API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    filter: {
                        and: [{
                            attribute: "company",
                            relation: "references",
                            value: {
                                record_id: companyRecordId,
                            },
                        }],
                    },
                    limit: 10,
                }),
            })
        }

        if (!response.ok) {
            console.log(`[Find Company Via Contacts] Failed to query contacts: ${response.status}`)
            return null
        }

        const data = await response.json()
        const people = data.data || []
        
        if (people.length === 0) {
            console.log(`[Find Company Via Contacts] No contacts found associated with company ${companyRecordId}`)
            return null
        }
        
        console.log(`[Find Company Via Contacts] Found ${people.length} contacts associated with company`)
        
        // Try to find Apollo organization via each contact's organization
        for (const person of people) {
            const emailAddresses = person.values?.email_addresses || []
            const email = emailAddresses[0]?.email_address
            
            if (!email) continue
            
            // Search for contact in Apollo
            try {
                const apolloContacts = await searchApolloContacts({
                    q_keywords: email,
                    per_page: 1,
                })
                
                // Apollo contacts have account_id (Apollo uses "Accounts" for companies)
                const accountId = apolloContacts[0].account_id || apolloContacts[0].organization_id
                if (accountId) {
                    console.log(`[Find Company Via Contacts] Found account ${accountId} via contact ${email}`)
                    
                    // Verify the account exists and get its details
                    const accounts = await searchApolloAccounts({
                        q_keywords: accountId,
                        per_page: 1,
                    })
                    
                    if (accounts.length > 0 && accounts[0].id === accountId) {
                        return accountId
                    }
                }
            } catch (error) {
                console.log(`[Find Company Via Contacts] Error searching for contact ${email}:`, error)
                continue
            }
        }
        
        return null
    } catch (error) {
        console.error(`[Find Company Via Contacts] Error:`, error)
        return null
    }
}

