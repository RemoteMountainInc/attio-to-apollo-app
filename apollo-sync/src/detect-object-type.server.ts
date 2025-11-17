import {getPerson, getCompany, getDeal} from "./attio-api.server"

/**
 * Detect the object type (person, company, deal) by trying to fetch the record
 * Returns the object type or null if not found
 */
export default async function detectObjectType(recordId: string): Promise<"people" | "companies" | "deals" | null> {
    // Try to fetch as person first
    try {
        const personRecord = await getPerson(recordId)
        if (personRecord?.data) {
            console.log(`[Detect Object Type] Record ${recordId} is a person`)
            return "people"
        }
    } catch (error) {
        // Not a person, continue
    }
    
    // Try to fetch as company
    try {
        const companyRecord = await getCompany(recordId)
        if (companyRecord?.data) {
            console.log(`[Detect Object Type] Record ${recordId} is a company`)
            return "companies"
        }
    } catch (error) {
        // Not a company, continue
    }
    
    // Try to fetch as deal
    try {
        const dealRecord = await getDeal(recordId)
        if (dealRecord?.data) {
            console.log(`[Detect Object Type] Record ${recordId} is a deal`)
            return "deals"
        }
    } catch (error) {
        // Not a deal
    }
    
    console.log(`[Detect Object Type] Could not determine object type for record ${recordId}`)
    return null
}

