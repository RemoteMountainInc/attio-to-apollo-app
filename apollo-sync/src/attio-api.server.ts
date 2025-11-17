import {ATTIO_API_TOKEN} from "attio/server"

const ATTIO_API_BASE = "https://api.attio.com"

/**
 * Fetch wrapper for Attio API requests
 * Based on Attio API documentation: https://docs.attio.com/rest-api/overview
 */
async function attioFetch(endpoint: string, options: RequestInit = {}) {
    const token = ATTIO_API_TOKEN
    if (!token) {
        throw new Error("Attio API token not available")
    }

    const response = await fetch(`${ATTIO_API_BASE}${endpoint}`, {
        ...options,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Attio API error (${response.status}): ${errorText}`)
    }

    return response.json()
}

/**
 * Get a person record from Attio by record ID
 * Based on Attio API: GET /v2/objects/people/records/{id}
 * 
 * Fetches the full record with all attribute data
 */
export async function getPerson(recordId: string) {
    console.error(`[getPerson] ===== FETCHING ATTIO RECORD =====`)
    console.error(`[getPerson] Fetching person record ${recordId} from Attio`)
    console.log(`[getPerson] Fetching person record ${recordId} from Attio`)
    
    // Include attributes to get full attribute data including custom fields like "status"
    // The ?include=attributes parameter ensures we get all attribute values
    const response = await attioFetch(`/v2/objects/people/records/${recordId}?include=attributes`)
    
    console.error(`[getPerson] Response structure:`, {
        hasData: !!response?.data,
        dataKeys: response?.data ? Object.keys(response.data) : [],
        valuesKeys: response?.data?.values ? Object.keys(response.data.values) : [],
    })
    console.log(`[getPerson] Response structure:`, {
        hasData: !!response?.data,
        dataKeys: response?.data ? Object.keys(response.data) : [],
        valuesKeys: response?.data?.values ? Object.keys(response.data.values) : [],
    })
    
    // Log ALL values keys to help debug
    if (response?.data?.values) {
        const allKeys = Object.keys(response.data.values)
        console.error(`[getPerson] All values keys (${allKeys.length}):`, allKeys)
        console.log(`[getPerson] All values keys (${allKeys.length}):`, allKeys)
        
        // Specifically check for status
        if (response.data.values.status !== undefined) {
            console.error(`[getPerson] FOUND status field:`, JSON.stringify(response.data.values.status, null, 2))
            console.log(`[getPerson] FOUND status field:`, JSON.stringify(response.data.values.status, null, 2))
        } else {
            console.error(`[getPerson] status field NOT FOUND`)
            console.log(`[getPerson] status field NOT FOUND`)
        }
        
        // Log any key that might be stage-related
        for (const key of allKeys) {
            const keyLower = key.toLowerCase()
            if (keyLower.includes('stage') || keyLower.includes('lifecycle') || keyLower === 'status') {
                console.error(`[getPerson] Found stage-related key "${key}":`, JSON.stringify(response.data.values[key], null, 2))
                console.log(`[getPerson] Found stage-related key "${key}":`, JSON.stringify(response.data.values[key], null, 2))
            }
        }
    } else {
        console.error(`[getPerson] No values object in response!`)
        console.log(`[getPerson] No values object in response!`)
    }
    
    return response
}

/**
 * Get a list item (e.g., stage) by its ID from Attio
 * This is used to resolve object references to get the actual name/title
 * Based on Attio API: GET /v2/lists/{list_id}/items/{item_id}
 */
export async function getListItemById(listId: string, itemId: string) {
    console.log(`[getListItemById] Fetching list item ${itemId} from list ${listId}`)
    try {
        const response = await attioFetch(`/v2/lists/${listId}/items/${itemId}`)
        console.log(`[getListItemById] List item response:`, response)
        return response
    } catch (error) {
        console.error(`[getListItemById] Failed to fetch list item:`, error)
        return null
    }
}

/**
 * Get a list by slug or name to find the list ID
 * This helps us find which list contains the stage items
 */
export async function getListBySlug(slug: string) {
    console.log(`[getListBySlug] Searching for list with slug: ${slug}`)
    try {
        const response = await attioFetch(`/v2/lists?slug=${slug}`)
        console.log(`[getListBySlug] List response:`, response)
        return response
    } catch (error) {
        console.error(`[getListBySlug] Failed to fetch list:`, error)
        return null
    }
}

/**
 * Update a person record in Attio
 * Based on Attio API: PATCH /v2/objects/people/records/{id}
 */
export async function updatePerson(
    recordId: string,
    data: {
        first_name?: string | null
        last_name?: string | null
        email: string
        stage?: string | null
    }
) {
    const values: Record<string, unknown> = {}
    
    // Email addresses - always required
    values.email_addresses = [{
        email_address: data.email,
        email_address_type: "work",
    }]
    
    // Name - Attio expects name as an array of name objects
    // Format: [{ first_name: "...", last_name: "...", attribute_type: "personal-name" }]
    const nameFields: Record<string, string> = {}
    if (data.first_name !== undefined && data.first_name !== null && String(data.first_name).trim() !== "") {
        nameFields.first_name = String(data.first_name).trim()
    }
    if (data.last_name !== undefined && data.last_name !== null && String(data.last_name).trim() !== "") {
        nameFields.last_name = String(data.last_name).trim()
    }
    
    // Only include name if we have at least one field
    // Attio expects name as an array
    if (Object.keys(nameFields).length > 0) {
        values.name = [{
            ...nameFields,
            attribute_type: "personal-name",
        }]
    }
    
    // Stage - Attio might store this as an array or direct value
    // Try to match the format that Attio expects
    if (data.stage !== undefined && data.stage !== null) {
        const stageValue = String(data.stage)
        // Try common stage attribute names - Attio might expect array format
        // First try as direct value
        values["Stage"] = stageValue
        // Also try as array format (like name) if direct doesn't work
        // Note: You may need to adjust this based on your Attio setup
        // values["Stage"] = [{ value: stageValue, attribute_type: "text" }]
    }
    
    const response = await attioFetch(`/v2/objects/people/records/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({
            data: {
                values: values,
            },
        }),
    })
    
    return response
}

/**
 * Get a company record from Attio by record ID
 * Based on Attio API: GET /v2/objects/companies/records/{id}
 */
export async function getCompany(recordId: string) {
    console.log(`[getCompany] Fetching company record ${recordId} from Attio`)
    const response = await attioFetch(`/v2/objects/companies/records/${recordId}?include=attributes`)
    return response
}

/**
 * Get a deal record from Attio by record ID
 * Based on Attio API: GET /v2/objects/deals/records/{id}
 */
export async function getDeal(recordId: string) {
    console.log(`[getDeal] Fetching deal record ${recordId} from Attio`)
    const response = await attioFetch(`/v2/objects/deals/records/${recordId}?include=attributes`)
    return response
}
