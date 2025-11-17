import {Button, TextBlock} from "attio/client"
import {useState} from "react"

import syncToApollo from "./sync-to-apollo.server"
import syncCompanyToApollo from "./sync-company-to-apollo.server"
import syncDealToApollo from "./sync-deal-to-apollo.server"
import getApolloContactId from "./get-apollo-contact-id.server"
import getApolloOrganizationId from "./get-apollo-organization-id.server"
import getApolloOpportunityId from "./get-apollo-opportunity-id.server"
import detectObjectType from "./detect-object-type.server"

export function ApolloSyncDialog({recordId}: {recordId: string}) {
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    const handleSyncToApollo = async () => {
        console.error(`[ApolloSyncDialog] Push to Apollo button clicked for record ${recordId}`)
        setLoading(true)
        setMessage("Detecting record type...")
        
        try {
            // Detect the object type
            const objectType = await detectObjectType(recordId)
            
            if (!objectType) {
                throw new Error("Could not determine record type. Please ensure the record exists.")
            }
            
            let result: {created: number; updated: number}
            
            if (objectType === "people") {
                setMessage("Syncing contact to Apollo...")
                console.error(`[ApolloSyncDialog] Syncing person record...`)
                result = await syncToApollo(recordId)
                setMessage(`Contact synced! Created: ${result.created}, Updated: ${result.updated}`)
            } else if (objectType === "companies") {
                setMessage("Syncing company to Apollo...")
                console.error(`[ApolloSyncDialog] Syncing company record...`)
                result = await syncCompanyToApollo(recordId)
                setMessage(`Company synced! Created: ${result.created}, Updated: ${result.updated}`)
            } else if (objectType === "deals") {
                setMessage("Syncing deal to Apollo...")
                console.error(`[ApolloSyncDialog] Syncing deal record...`)
                result = await syncDealToApollo(recordId)
                setMessage(`Deal synced! Created: ${result.created}, Updated: ${result.updated}`)
            } else {
                throw new Error(`Unsupported object type: ${objectType}`)
            }
            
            console.error(`[ApolloSyncDialog] Sync completed:`, result)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error"
            console.error("[ApolloSyncDialog] Sync to Apollo error:", error)
            console.error("[ApolloSyncDialog] Error message:", errorMessage)
            setMessage(`Error: ${errorMessage}`)
        } finally {
            setLoading(false)
        }
    }

    const handleViewInApollo = async () => {
        setLoading(true)
        setMessage("Finding record in Apollo...")
        
        try {
            // Detect object type
            const objectType = await detectObjectType(recordId)
            
            if (objectType === "people") {
                const apolloContactId = await getApolloContactId(recordId)
                
                if (apolloContactId) {
                    // Open Apollo contact page in new tab
                    const apolloUrl = `https://app.apollo.io/#/contacts/${apolloContactId}`
                    window.open(apolloUrl, '_blank')
                    setMessage(`Opening Apollo contact page...`)
                } else {
                    setMessage(`Contact not found in Apollo. Please sync the contact first.`)
                }
            } else if (objectType === "companies") {
                const apolloAccountId = await getApolloOrganizationId(recordId)
                
                if (apolloAccountId) {
                    // Validate that the account ID looks like an ID (not a domain)
                    if (apolloAccountId.includes('.') || apolloAccountId.includes('/')) {
                        console.error(`[ApolloSyncDialog] Invalid account ID format: ${apolloAccountId}`)
                        setMessage(`Error: Invalid account ID format. Please sync the company first.`)
                        return
                    }
                    
                    // Open Apollo account page in new tab (Apollo uses "Accounts" for companies)
                    // Try different URL formats
                    const apolloUrl = `https://app.apollo.io/#/accounts/${apolloAccountId}`
                    console.log(`[ApolloSyncDialog] Opening Apollo account URL: ${apolloUrl}`)
                    window.open(apolloUrl, '_blank')
                    setMessage(`Opening Apollo account page...`)
                } else {
                    setMessage(`Company not found in Apollo. Please sync the company first.`)
                }
            } else if (objectType === "deals") {
                const apolloOppId = await getApolloOpportunityId(recordId)
                
                if (apolloOppId) {
                    // Open Apollo opportunity page in new tab
                    const apolloUrl = `https://app.apollo.io/#/opportunities/${apolloOppId}`
                    window.open(apolloUrl, '_blank')
                    setMessage(`Opening Apollo opportunity page...`)
                } else {
                    setMessage(`Deal not found in Apollo. Please sync the deal first.`)
                }
            } else {
                setMessage(`Could not determine record type.`)
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error"
            console.error("[ApolloSyncDialog] View in Apollo error:", error)
            setMessage(`Error: ${errorMessage}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <TextBlock>Sync records from Attio to Apollo (Contacts, Companies, Deals)</TextBlock>
            
            <Button
                label="Push to Apollo"
                onClick={handleSyncToApollo}
                disabled={loading}
            />
            
            <Button
                label="View Record in Apollo"
                onClick={handleViewInApollo}
                disabled={loading}
            />

            {message && (
                <TextBlock>
                    {message}
                </TextBlock>
            )}
        </>
    )
}

