import {searchApolloContacts} from "./apollo-api.server"
import {getPerson} from "./attio-api.server"
import {validateStageMapping} from "./stage-mapping.server"

/**
 * Detect stage value conflicts between Attio and Apollo
 * This function compares stage values from both systems and identifies unmapped values
 */
export async function detectStageConflicts(recordId: string): Promise<{
    conflicts: Array<{
        type: "unmapped_attio" | "unmapped_apollo" | "mismatch"
        attioStage: string | null
        apolloStage: string | null
        message: string
    }>
    recommendations: string[]
}> {
    const conflicts: Array<{
        type: "unmapped_attio" | "unmapped_apollo" | "mismatch"
        attioStage: string | null
        apolloStage: string | null
        message: string
    }> = []
    const recommendations: string[] = []

    try {
        // Get Attio record
        const attioRecord = await getPerson(recordId)
        const recordData = attioRecord?.data || {}
        const emailAddresses = recordData.values?.email_addresses || []
        const email = emailAddresses[0]?.email_address

        if (!email) {
            return {
                conflicts: [{
                    type: "mismatch",
                    attioStage: null,
                    apolloStage: null,
                    message: "No email address found - cannot compare stages"
                }],
                recommendations: ["Add an email address to the record to enable stage comparison"]
            }
        }

        // Get Attio stage
        const attioStage = recordData.values?.Stage || 
                          recordData.values?.stage || 
                          recordData.values?.lifecycle_stage || 
                          null

        // Get Apollo contact
        const apolloContacts = await searchApolloContacts({
            q_keywords: email,
            per_page: 1,
        })

        if (apolloContacts.length === 0) {
            return {
                conflicts: [{
                    type: "mismatch",
                    attioStage: attioStage,
                    apolloStage: null,
                    message: "Contact not found in Apollo - cannot compare stages"
                }],
                recommendations: ["Contact does not exist in Apollo. Sync the contact first."]
            }
        }

        const apolloContact = apolloContacts[0]
        const apolloStage = apolloContact.stage || apolloContact.lifecycle_stage || null

        // Validate mappings
        const validation = await validateStageMapping(attioStage, apolloStage)
        
        if (!validation.isValid) {
            validation.warnings.forEach((warning: string) => {
                if (warning.includes("Attio")) {
                    conflicts.push({
                        type: "unmapped_attio",
                        attioStage: attioStage,
                        apolloStage: apolloStage,
                        message: warning
                    })
                    recommendations.push(`Add mapping for Attio stage "${attioStage}" in stage-mapping.server.ts`)
                } else if (warning.includes("Apollo")) {
                    conflicts.push({
                        type: "unmapped_apollo",
                        attioStage: attioStage,
                        apolloStage: apolloStage,
                        message: warning
                    })
                    recommendations.push(`Add mapping for Apollo stage "${apolloStage}" in stage-mapping.server.ts`)
                }
            })
        }

        // Check for value mismatch (if both have values but they're different)
        if (attioStage && apolloStage && attioStage.toLowerCase() !== apolloStage.toLowerCase()) {
            conflicts.push({
                type: "mismatch",
                attioStage: attioStage,
                apolloStage: apolloStage,
                message: `Stage values differ: Attio has "${attioStage}" but Apollo has "${apolloStage}"`
            })
            recommendations.push(`Consider syncing to align stages, or add a mapping if these represent the same stage`)
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        conflicts.push({
            type: "mismatch",
            attioStage: null,
            apolloStage: null,
            message: `Error detecting conflicts: ${errorMessage}`
        })
    }

    return { conflicts, recommendations }
}

