import {getWorkspaceConnection} from "attio/server"
import {z} from "zod"

// Apollo API Contact Schema based on official documentation
const apolloContactSchema = z.object({
    id: z.string().optional(),
    email: z.string().optional().nullable(),
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    stage: z.string().optional().nullable(),
    lifecycle_stage: z.string().optional().nullable(),
    lifecycle_stage_id: z.string().optional().nullable(),
    contact_stage_id: z.string().optional().nullable(),
    // Additional fields for comprehensive attribute syncing
    title: z.string().optional().nullable(),
    organization_name: z.string().optional().nullable(),
    organization_id: z.string().optional().nullable(), // Apollo contacts can have organization_id
    account_id: z.string().optional().nullable(), // Apollo uses account_id for companies
    // phone_numbers removed - not syncing to avoid errors
    linkedin_url: z.string().optional().nullable(),
    twitter_url: z.string().optional().nullable(),
    facebook_url: z.string().optional().nullable(),
    instagram_url: z.string().optional().nullable(),
    bio: z.string().optional().nullable(),
})

const apolloContactStageSchema = z.object({
    id: z.string(),
    name: z.string(),
})

const apolloContactStagesResponseSchema = z.object({
    contact_stages: z.array(apolloContactStageSchema).optional(),
})

const apolloSearchResponseSchema = z.object({
    contacts: z.array(apolloContactSchema).optional(),
})

const apolloUpdateResponseSchema = z.object({
    contact: apolloContactSchema.optional(),
})

export type ApolloContact = z.infer<typeof apolloContactSchema>
export type ApolloContactStage = z.infer<typeof apolloContactStageSchema>

/**
 * Get Apollo API key from Attio workspace connection
 */
async function getApolloApiKey(): Promise<string> {
    try {
        const connection = getWorkspaceConnection()
        if (!connection || !connection.value) {
            throw new Error("Apollo API key not found in workspace connection")
        }
        console.log(`[Apollo API] API key retrieved (length: ${connection.value.length})`)
        return connection.value
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        throw new Error(`Apollo connection not configured: ${errorMsg}. Please set up the Apollo connection in app settings.`)
    }
}

/**
 * Get a single contact by ID from Apollo
 * Based on Apollo API documentation
 */
export async function getApolloContact(contactId: string): Promise<ApolloContact> {
    const apiKey = await getApolloApiKey()
    
    // Apollo API uses api_key as a query parameter for GET requests
    const url = new URL(`https://api.apollo.io/v1/contacts/${contactId}`)
    url.searchParams.append("api_key", apiKey)
    
    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo get contact API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return apolloContactSchema.parse(data.contact || data)
}

/**
 * Get a single account by ID from Apollo
 * Based on Apollo API documentation: https://docs.apollo.io/reference/update-an-account
 * Apollo uses "Accounts" for companies
 */
export async function getApolloAccount(accountId: string): Promise<ApolloAccount> {
    const apiKey = await getApolloApiKey()
    
    // Apollo API uses api_key as a query parameter for GET requests
    const url = new URL(`https://api.apollo.io/api/v1/accounts/${accountId}`)
    url.searchParams.append("api_key", apiKey)
    
    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo get account API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return apolloAccountSchema.parse(data.account || data)
}

// Alias for backward compatibility
export async function getApolloOrganization(organizationId: string): Promise<ApolloOrganization> {
    return getApolloAccount(organizationId)
}

/**
 * List all contact stages from Apollo
 * Based on Apollo API documentation: https://docs.apollo.io/reference/list-contact-stages
 * GET /api/v1/contact_stages
 */
export async function listApolloContactStages(): Promise<ApolloContactStage[]> {
    const apiKey = await getApolloApiKey()
    
    // Apollo API uses api_key as a query parameter for GET requests
    const url = new URL("https://api.apollo.io/api/v1/contact_stages")
    url.searchParams.append("api_key", apiKey)
    
    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo list stages API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    console.log(`[Apollo API] Fetched contact stages:`, data)
    const parsed = apolloContactStagesResponseSchema.parse(data)
    return parsed.contact_stages || []
}

// ===== APOLLO OPPORTUNITY STAGES API =====

const apolloOpportunityStageSchema = z.object({
    id: z.string(),
    name: z.string(),
})

const apolloOpportunityStagesResponseSchema = z.object({
    opportunity_stages: z.array(apolloOpportunityStageSchema).optional(),
    stages: z.array(apolloOpportunityStageSchema).optional(),
})

export type ApolloOpportunityStage = z.infer<typeof apolloOpportunityStageSchema>

/**
 * List all opportunity stages from Apollo (Sales Pipeline)
 * Based on Apollo API documentation
 * GET /api/v1/opportunity_stages or similar
 */
export async function listApolloOpportunityStages(): Promise<ApolloOpportunityStage[]> {
    const apiKey = await getApolloApiKey()
    
    // Try different possible endpoints for opportunity stages (Deal Pipeline)
    // Reference: https://docs.apollo.io/reference/list-deal-stages
    const endpoints = [
        "https://api.apollo.io/api/v1/opportunity_stages", // Most likely correct endpoint
        "https://api.apollo.io/api/v1/deal_stages",
        "https://api.apollo.io/api/v1/deal_pipelines",
        "https://api.apollo.io/api/v1/deal_pipeline/stages",
        "https://api.apollo.io/api/v1/opportunities/stages",
        "https://api.apollo.io/api/v1/pipelines",
    ]
    
    for (const endpoint of endpoints) {
        try {
            const url = new URL(endpoint)
            url.searchParams.append("api_key", apiKey)
            
            const response = await fetch(url.toString(), {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            })

            if (response.ok) {
                const data = await response.json()
                console.log(`[Apollo API] Fetched opportunity stages from ${endpoint}:`, data)
                
                // Try to parse the response
                const parsed = apolloOpportunityStagesResponseSchema.safeParse(data)
                if (parsed.success) {
                    return parsed.data.opportunity_stages || parsed.data.stages || []
                }
                
                // If schema doesn't match, try to extract stages from response
                // Handle different response formats for Deal Pipeline
                if (data.deal_pipelines && Array.isArray(data.deal_pipelines)) {
                    // Deal pipelines might have stages nested inside
                    const allStages: Array<{id: string; name: string}> = []
                    for (const pipeline of data.deal_pipelines) {
                        if (pipeline.stages && Array.isArray(pipeline.stages)) {
                            allStages.push(...pipeline.stages.map((s: any) => ({ id: s.id, name: s.name })))
                        }
                    }
                    if (allStages.length > 0) return allStages
                }
                if (data.opportunity_stages && Array.isArray(data.opportunity_stages)) {
                    return data.opportunity_stages.map((s: any) => ({ id: s.id, name: s.name }))
                }
                if (data.stages && Array.isArray(data.stages)) {
                    return data.stages.map((s: any) => ({ id: s.id, name: s.name }))
                }
                if (Array.isArray(data)) {
                    return data.map((s: any) => ({ id: s.id, name: s.name }))
                }
            }
        } catch (error) {
            console.log(`[Apollo API] Endpoint ${endpoint} failed, trying next...`)
            continue
        }
    }
    
    // If all endpoints fail, return empty array
    console.warn(`[Apollo API] Could not fetch opportunity stages from any endpoint`)
    return []
}

/**
 * Search for contacts in Apollo by email
 * Based on Apollo API documentation: https://docs.apollo.io/
 */
export async function searchApolloContacts(params: {
    per_page?: number
    page?: number
    q_keywords?: string
}): Promise<ApolloContact[]> {
    const apiKey = await getApolloApiKey()
    
    const requestBody: Record<string, unknown> = {
        api_key: apiKey,
        per_page: params.per_page || 10,
        page: params.page || 1,
    }
    
    if (params.q_keywords) {
        requestBody.q_keywords = params.q_keywords
    }
    
    const response = await fetch("https://api.apollo.io/v1/contacts/search", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo search API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const parsed = apolloSearchResponseSchema.parse(data)
    return parsed.contacts || []
}

/**
 * Create a new contact in Apollo
 * Based on Apollo API documentation: POST /v1/contacts
 */
export async function createApolloContact(contact: {
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
}): Promise<ApolloContact> {
    const apiKey = await getApolloApiKey()
    
    const requestBody: Record<string, unknown> = {
        api_key: apiKey,
        email: contact.email,
    }
    
    // Add first_name if provided (even if empty string)
    if (contact.first_name !== undefined && contact.first_name !== null) {
        requestBody.first_name = String(contact.first_name).trim()
    }
    
    // Add last_name if provided (even if empty string)
    if (contact.last_name !== undefined && contact.last_name !== null) {
        requestBody.last_name = String(contact.last_name).trim()
    }
    
    // Add contact_stage_id if provided (Apollo uses stage IDs, not names)
    // contact.stage can be either a stage ID or stage name
    if (contact.stage !== undefined && contact.stage !== null) {
        const stageValue = String(contact.stage)
        // Check if it looks like an ID (long alphanumeric) or a name
        // If it's a valid ID format, use contact_stage_id, otherwise try lifecycle_stage
        if (stageValue.length > 20 && /^[a-zA-Z0-9]+$/.test(stageValue)) {
            // Looks like an ID
            requestBody.contact_stage_id = stageValue
            console.log(`[Apollo API] Setting contact_stage_id: "${stageValue}"`)
        } else {
            // Looks like a name, use lifecycle_stage
            requestBody.lifecycle_stage = stageValue
            console.log(`[Apollo API] Setting lifecycle_stage: "${stageValue}"`)
        }
    }
    
    // Add additional attributes if provided
    if (contact.title !== undefined && contact.title !== null) {
        requestBody.title = String(contact.title).trim()
    }
    if (contact.organization_name !== undefined && contact.organization_name !== null) {
        requestBody.organization_name = String(contact.organization_name).trim()
    }
    // Phone numbers removed - not syncing to avoid errors
    if (contact.linkedin_url !== undefined && contact.linkedin_url !== null) {
        requestBody.linkedin_url = String(contact.linkedin_url).trim()
    }
    if (contact.twitter_url !== undefined && contact.twitter_url !== null) {
        requestBody.twitter_url = String(contact.twitter_url).trim()
    }
    if (contact.facebook_url !== undefined && contact.facebook_url !== null) {
        requestBody.facebook_url = String(contact.facebook_url).trim()
    }
    if (contact.instagram_url !== undefined && contact.instagram_url !== null) {
        requestBody.instagram_url = String(contact.instagram_url).trim()
    }
    if (contact.bio !== undefined && contact.bio !== null) {
        requestBody.bio = String(contact.bio).trim()
    }
    
    const response = await fetch("https://api.apollo.io/v1/contacts", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo create API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return apolloContactSchema.parse(data.contact || data)
}

/**
 * Update an existing contact in Apollo
 * Based on Apollo API documentation: PATCH /v1/contacts/{id}
 * 
 * CRITICAL APPROACH: Fetch current contact first, then merge and update
 * This ensures we don't lose any existing data
 */
export async function updateApolloContact(
    contactId: string,
    contact: {
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
    }
): Promise<ApolloContact> {
    const apiKey = await getApolloApiKey()
    
    console.log(`[Apollo API] ===== UPDATE CONTACT START =====`)
    console.log(`[Apollo API] Contact ID: ${contactId}`)
    console.log(`[Apollo API] New data from Attio:`, {
        email: contact.email,
        first_name: contact.first_name,
        last_name: contact.last_name,
        stage: contact.stage,
    })
    
    // Step 1: Fetch current contact from Apollo to preserve existing data
    console.log(`[Apollo API] Fetching current contact from Apollo...`)
    let currentContact: ApolloContact
    try {
        currentContact = await getApolloContact(contactId)
        console.log(`[Apollo API] Current Apollo contact:`, {
            email: currentContact.email,
            first_name: currentContact.first_name,
            last_name: currentContact.last_name,
            lifecycle_stage: currentContact.lifecycle_stage,
        })
    } catch (error) {
        console.log(`[Apollo API] Could not fetch current contact, proceeding with update only`)
        currentContact = {} as ApolloContact
    }
    
    // Step 2: Build request body - merge Attio data with existing Apollo data
    // Apollo API requires explicit field updates
    const requestBody: Record<string, unknown> = {
        api_key: apiKey,
    }
    
    // Always include email (use new one from Attio)
    requestBody.email = contact.email
    
    // CRITICAL: Always send first_name - use new value from Attio if provided, otherwise keep existing
    if (contact.first_name !== undefined) {
        // If Attio has a value (even if empty string), use it
        requestBody.first_name = contact.first_name === null ? "" : String(contact.first_name).trim()
        console.log(`[Apollo API] Setting first_name from Attio: "${requestBody.first_name}"`)
    } else if (currentContact.first_name !== undefined) {
        // Keep existing value if Attio doesn't provide one
        requestBody.first_name = currentContact.first_name || ""
        console.log(`[Apollo API] Keeping existing first_name: "${requestBody.first_name}"`)
    }
    
    // CRITICAL: Always send last_name - use new value from Attio if provided, otherwise keep existing
    if (contact.last_name !== undefined) {
        // If Attio has a value (even if empty string), use it
        requestBody.last_name = contact.last_name === null ? "" : String(contact.last_name).trim()
        console.log(`[Apollo API] Setting last_name from Attio: "${requestBody.last_name}"`)
    } else if (currentContact.last_name !== undefined) {
        // Keep existing value if Attio doesn't provide one
        requestBody.last_name = currentContact.last_name || ""
        console.log(`[Apollo API] Keeping existing last_name: "${requestBody.last_name}"`)
    }
    
    // Add contact_stage_id if provided (Apollo uses stage IDs, not names)
    // contact.stage can be either a stage ID or stage name
    if (contact.stage !== undefined && contact.stage !== null) {
        const stageValue = String(contact.stage)
        console.log(`[Apollo API] Processing stage value: "${stageValue}" (length: ${stageValue.length})`)
        console.error(`[Apollo API] Processing stage value: "${stageValue}" (length: ${stageValue.length})`)
        // Check if it looks like an ID (long alphanumeric) or a name
        // If it's a valid ID format, use contact_stage_id, otherwise try lifecycle_stage
        if (stageValue.length > 20 && /^[a-zA-Z0-9]+$/.test(stageValue)) {
            // Looks like an ID
            requestBody.contact_stage_id = stageValue
            console.log(`[Apollo API] Setting contact_stage_id: "${stageValue}"`)
            console.error(`[Apollo API] Setting contact_stage_id: "${stageValue}"`)
        } else {
            // Looks like a name, use lifecycle_stage
            requestBody.lifecycle_stage = stageValue
            console.log(`[Apollo API] Setting lifecycle_stage: "${stageValue}"`)
            console.error(`[Apollo API] Setting lifecycle_stage: "${stageValue}"`)
        }
    } else {
        console.error(`[Apollo API] No stage provided in contact update! contact.stage: ${contact.stage}`)
    }
    
    // Add additional attributes if provided
    if (contact.title !== undefined && contact.title !== null) {
        requestBody.title = String(contact.title).trim()
        console.log(`[Apollo API] Setting title: "${requestBody.title}"`)
    }
    if (contact.organization_name !== undefined && contact.organization_name !== null) {
        requestBody.organization_name = String(contact.organization_name).trim()
        console.log(`[Apollo API] Setting organization_name: "${requestBody.organization_name}"`)
    }
    // phone_numbers removed - not syncing to avoid errors
    if (contact.linkedin_url !== undefined && contact.linkedin_url !== null) {
        requestBody.linkedin_url = String(contact.linkedin_url).trim()
        console.log(`[Apollo API] Setting linkedin_url: "${requestBody.linkedin_url}"`)
    }
    if (contact.twitter_url !== undefined && contact.twitter_url !== null) {
        requestBody.twitter_url = String(contact.twitter_url).trim()
        console.log(`[Apollo API] Setting twitter_url: "${requestBody.twitter_url}"`)
    }
    if (contact.facebook_url !== undefined && contact.facebook_url !== null) {
        requestBody.facebook_url = String(contact.facebook_url).trim()
        console.log(`[Apollo API] Setting facebook_url: "${requestBody.facebook_url}"`)
    }
    if (contact.instagram_url !== undefined && contact.instagram_url !== null) {
        requestBody.instagram_url = String(contact.instagram_url).trim()
        console.log(`[Apollo API] Setting instagram_url: "${requestBody.instagram_url}"`)
    }
    if (contact.bio !== undefined && contact.bio !== null) {
        requestBody.bio = String(contact.bio).trim()
        console.log(`[Apollo API] Setting bio: "${requestBody.bio}"`)
    }
    
    console.log(`[Apollo API] Final request body:`, JSON.stringify(requestBody, null, 2))
    
    // Step 3: Send PATCH request to Apollo
    console.log(`[Apollo API] Sending PATCH request to: https://api.apollo.io/v1/contacts/${contactId}`)
    const response = await fetch(`https://api.apollo.io/v1/contacts/${contactId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    })

    const responseText = await response.text()
    console.log(`[Apollo API] Response status: ${response.status} ${response.statusText}`)
    console.log(`[Apollo API] Response body:`, responseText.substring(0, 500)) // First 500 chars
    
    if (!response.ok) {
        console.error(`[Apollo API] Update failed!`, {
            status: response.status,
            statusText: response.statusText,
            body: responseText,
        })
        throw new Error(`Apollo update API error (${response.status}): ${responseText}`)
    }

    let responseData
    try {
        responseData = JSON.parse(responseText)
    } catch (e) {
        throw new Error(`Invalid JSON response from Apollo: ${responseText}`)
    }
    
    const parsed = apolloUpdateResponseSchema.parse(responseData)
    const updatedContact = parsed.contact
    
    if (!updatedContact) {
        throw new Error(`Apollo API did not return updated contact in response`)
    }
    
    console.log(`[Apollo API] ===== UPDATE CONTACT SUCCESS =====`)
    console.log(`[Apollo API] Updated contact:`, {
        id: updatedContact.id,
        email: updatedContact.email,
        first_name: updatedContact.first_name,
        last_name: updatedContact.last_name,
        lifecycle_stage: updatedContact.lifecycle_stage,
        updated_at: (updatedContact as any).updated_at,
    })
    
    // Verify the update worked
    let allUpdatesSuccessful = true
    
    if (contact.first_name !== undefined) {
        const expected = contact.first_name === null ? "" : String(contact.first_name).trim()
        const actual = updatedContact.first_name || ""
        if (expected !== actual) {
            console.error(`[Apollo API] WARNING: first_name mismatch! Expected: "${expected}", Got: "${actual}"`)
            allUpdatesSuccessful = false
        } else {
            console.log(`[Apollo API] first_name updated correctly: "${actual}"`)
        }
    }
    
    if (contact.last_name !== undefined) {
        const expected = contact.last_name === null ? "" : String(contact.last_name).trim()
        const actual = updatedContact.last_name || ""
        if (expected !== actual) {
            console.error(`[Apollo API] WARNING: last_name mismatch! Expected: "${expected}", Got: "${actual}"`)
            allUpdatesSuccessful = false
        } else {
            console.log(`[Apollo API] last_name updated correctly: "${actual}"`)
        }
    }
    
    if (allUpdatesSuccessful) {
        console.log(`[Apollo API] ALL UPDATES SUCCESSFUL! The contact has been updated in Apollo.`)
        console.log(`[Apollo API] Note: You may need to refresh the Apollo UI to see the changes.`)
    }
    
    // Wait a moment to ensure the update is fully processed
    await new Promise(resolve => setTimeout(resolve, 500))
    
    return updatedContact
}

// ===== APOLLO COMPANIES (ACCOUNTS) API =====
// Note: Apollo uses "Accounts" for companies, not "Organizations"
// Reference: https://docs.apollo.io/reference/update-an-account

const apolloAccountSchema = z.object({
    id: z.string().optional(),
    name: z.string().optional().nullable(),
    website_url: z.string().optional().nullable(),
    domain: z.string().optional().nullable(), // Apollo has a domain field
    linkedin_url: z.string().optional().nullable(),
    twitter_url: z.string().optional().nullable(),
    facebook_url: z.string().optional().nullable(),
    instagram_url: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    industry: z.string().optional().nullable(),
    estimated_num_employees: z.number().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
})

const apolloAccountSearchResponseSchema = z.object({
    accounts: z.array(apolloAccountSchema).optional(),
})

const apolloAccountUpdateResponseSchema = z.object({
    account: apolloAccountSchema.optional(),
})

export type ApolloAccount = z.infer<typeof apolloAccountSchema>
// Keep alias for backward compatibility
export type ApolloOrganization = ApolloAccount

/**
 * Search for accounts in Apollo by name or domain
 * Apollo uses "Accounts" for companies
 * Reference: https://docs.apollo.io/reference/search-for-accounts
 */
export async function searchApolloAccounts(params: {
    per_page?: number
    page?: number
    q_keywords?: string
    name?: string
    website_url?: string
    domain?: string
}): Promise<ApolloAccount[]> {
    const apiKey = await getApolloApiKey()
    
    const requestBody: Record<string, unknown> = {
        api_key: apiKey,
        per_page: params.per_page || 10,
        page: params.page || 1,
    }
    
    if (params.q_keywords) {
        requestBody.q_keywords = params.q_keywords
    }
    if (params.name) {
        requestBody.name = params.name
    }
    if (params.website_url) {
        requestBody.website_url = params.website_url
    }
    if (params.domain) {
        requestBody.domain = params.domain
    }
    
    const response = await fetch("https://api.apollo.io/api/v1/accounts/search", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo search accounts API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const parsed = apolloAccountSearchResponseSchema.parse(data)
    return parsed.accounts || []
}

// Alias for backward compatibility
export async function searchApolloOrganizations(params: {
    per_page?: number
    page?: number
    q_keywords?: string
    name?: string
    website_url?: string
    domain?: string
}): Promise<ApolloOrganization[]> {
    return searchApolloAccounts(params)
}

/**
 * Create a new account in Apollo
 * Apollo uses "Accounts" for companies
 * Reference: https://docs.apollo.io/reference/create-an-account
 */
export async function createApolloAccount(account: {
    name: string
    website_url?: string | null
    linkedin_url?: string | null
    twitter_url?: string | null
    facebook_url?: string | null
    instagram_url?: string | null
    description?: string | null
    industry?: string | null
    estimated_num_employees?: number | null
    city?: string | null
    state?: string | null
    country?: string | null
}): Promise<ApolloAccount> {
    const apiKey = await getApolloApiKey()
    
    const requestBody: Record<string, unknown> = {
        api_key: apiKey,
        name: account.name,
    }
    
    if (account.website_url !== undefined && account.website_url !== null) {
        requestBody.website_url = String(account.website_url).trim()
    }
    if (account.linkedin_url !== undefined && account.linkedin_url !== null) {
        requestBody.linkedin_url = String(account.linkedin_url).trim()
    }
    if (account.twitter_url !== undefined && account.twitter_url !== null) {
        requestBody.twitter_url = String(account.twitter_url).trim()
    }
    if (account.facebook_url !== undefined && account.facebook_url !== null) {
        requestBody.facebook_url = String(account.facebook_url).trim()
    }
    if (account.instagram_url !== undefined && account.instagram_url !== null) {
        requestBody.instagram_url = String(account.instagram_url).trim()
    }
    if (account.description !== undefined && account.description !== null) {
        requestBody.description = String(account.description).trim()
    }
    if (account.industry !== undefined && account.industry !== null) {
        requestBody.industry = String(account.industry).trim()
    }
    if (account.estimated_num_employees !== undefined && account.estimated_num_employees !== null) {
        requestBody.estimated_num_employees = account.estimated_num_employees
    }
    if (account.city !== undefined && account.city !== null) {
        requestBody.city = String(account.city).trim()
    }
    if (account.state !== undefined && account.state !== null) {
        requestBody.state = String(account.state).trim()
    }
    if (account.country !== undefined && account.country !== null) {
        requestBody.country = String(account.country).trim()
    }
    
    const response = await fetch("https://api.apollo.io/api/v1/accounts", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo create account API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return apolloAccountSchema.parse(data.account || data)
}

// Alias for backward compatibility
export async function createApolloOrganization(org: {
    name: string
    website_url?: string | null
    linkedin_url?: string | null
    twitter_url?: string | null
    facebook_url?: string | null
    instagram_url?: string | null
    description?: string | null
    industry?: string | null
    estimated_num_employees?: number | null
    city?: string | null
    state?: string | null
    country?: string | null
}): Promise<ApolloOrganization> {
    return createApolloAccount(org)
}

/**
 * Update an existing account in Apollo
 * Apollo uses "Accounts" for companies
 * Reference: https://docs.apollo.io/reference/update-an-account
 * PATCH https://api.apollo.io/api/v1/accounts/{account_id}
 */
export async function updateApolloAccount(
    accountId: string,
    account: {
        name?: string
        website_url?: string | null
        linkedin_url?: string | null
        twitter_url?: string | null
        facebook_url?: string | null
        instagram_url?: string | null
        description?: string | null
        industry?: string | null
        estimated_num_employees?: number | null
        city?: string | null
        state?: string | null
        country?: string | null
    }
): Promise<ApolloAccount> {
    const apiKey = await getApolloApiKey()
    
    // Apollo API - First verify the account exists
    let accountExists = false
    let existingAccount: ApolloAccount | null = null
    try {
        existingAccount = await getApolloAccount(accountId)
        accountExists = true
        console.log(`[Apollo API] Verified account ${accountId} exists: ${existingAccount.name}`)
    } catch (error) {
        console.log(`[Apollo API] Account ${accountId} not found, will create new one instead`)
        accountExists = false
    }
    
    // If account doesn't exist, create it instead of updating
    if (!accountExists) {
        console.log(`[Apollo API] Creating new account since ${accountId} doesn't exist`)
        return await createApolloAccount({
            name: account.name || "",
            website_url: account.website_url,
            linkedin_url: account.linkedin_url,
            twitter_url: account.twitter_url,
            facebook_url: account.facebook_url,
            instagram_url: account.instagram_url,
            description: account.description,
            industry: account.industry,
            estimated_num_employees: account.estimated_num_employees,
            city: account.city,
            state: account.state,
            country: account.country,
        })
    }
    
    const requestBody: Record<string, unknown> = {}
    
    // Always include name (required field)
    if (account.name !== undefined) {
        requestBody.name = String(account.name).trim()
    } else if (existingAccount?.name) {
        requestBody.name = existingAccount.name
    }
    if (account.website_url !== undefined && account.website_url !== null) {
        requestBody.website_url = String(account.website_url).trim()
    }
    if (account.linkedin_url !== undefined && account.linkedin_url !== null) {
        requestBody.linkedin_url = String(account.linkedin_url).trim()
    }
    if (account.twitter_url !== undefined && account.twitter_url !== null) {
        requestBody.twitter_url = String(account.twitter_url).trim()
    }
    if (account.facebook_url !== undefined && account.facebook_url !== null) {
        requestBody.facebook_url = String(account.facebook_url).trim()
    }
    if (account.instagram_url !== undefined && account.instagram_url !== null) {
        requestBody.instagram_url = String(account.instagram_url).trim()
    }
    if (account.description !== undefined && account.description !== null) {
        requestBody.description = String(account.description).trim()
    }
    if (account.industry !== undefined && account.industry !== null) {
        requestBody.industry = String(account.industry).trim()
    }
    if (account.estimated_num_employees !== undefined && account.estimated_num_employees !== null) {
        requestBody.estimated_num_employees = account.estimated_num_employees
    }
    if (account.city !== undefined && account.city !== null) {
        requestBody.city = String(account.city).trim()
    }
    if (account.state !== undefined && account.state !== null) {
        requestBody.state = String(account.state).trim()
    }
    if (account.country !== undefined && account.country !== null) {
        requestBody.country = String(account.country).trim()
    }
    
    // Apollo API - use PATCH to /api/v1/accounts/{account_id} with api_key as query parameter
    // Reference: https://docs.apollo.io/reference/update-an-account
    const url = new URL(`https://api.apollo.io/api/v1/accounts/${accountId}`)
    url.searchParams.append("api_key", apiKey)
    
    const response = await fetch(url.toString(), {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo update account API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const parsed = apolloAccountUpdateResponseSchema.parse(data)
    return parsed.account || apolloAccountSchema.parse(data)
}

// Alias for backward compatibility
export async function updateApolloOrganization(
    organizationId: string,
    org: {
        name?: string
        website_url?: string | null
        linkedin_url?: string | null
        twitter_url?: string | null
        facebook_url?: string | null
        instagram_url?: string | null
        description?: string | null
        industry?: string | null
        estimated_num_employees?: number | null
        city?: string | null
        state?: string | null
        country?: string | null
    }
): Promise<ApolloOrganization> {
    return updateApolloAccount(organizationId, org)
}

// ===== APOLLO DEALS (OPPORTUNITIES) API =====

const apolloOpportunitySchema = z.object({
    id: z.string().optional(),
    name: z.string().optional().nullable(),
    organization_id: z.string().optional().nullable(),
    organization_name: z.string().optional().nullable(),
    amount: z.number().optional().nullable(),
    stage: z.string().optional().nullable(),
    stage_id: z.string().optional().nullable(),
    probability: z.number().optional().nullable(),
    close_date: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
})

const apolloOpportunitySearchResponseSchema = z.object({
    opportunities: z.array(apolloOpportunitySchema).optional(),
})

const apolloOpportunityUpdateResponseSchema = z.object({
    opportunity: apolloOpportunitySchema.optional(),
})

export type ApolloOpportunity = z.infer<typeof apolloOpportunitySchema>

/**
 * Search for opportunities in Apollo
 */
export async function searchApolloOpportunities(params: {
    per_page?: number
    page?: number
    q_keywords?: string
    name?: string
}): Promise<ApolloOpportunity[]> {
    const apiKey = await getApolloApiKey()
    
    const requestBody: Record<string, unknown> = {
        api_key: apiKey,
        per_page: params.per_page || 10,
        page: params.page || 1,
    }
    
    if (params.q_keywords) {
        requestBody.q_keywords = params.q_keywords
    }
    if (params.name) {
        requestBody.name = params.name
    }
    
    const response = await fetch("https://api.apollo.io/api/v1/opportunities/search", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo search opportunities API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const parsed = apolloOpportunitySearchResponseSchema.parse(data)
    return parsed.opportunities || []
}

/**
 * Create a new opportunity/deal in Apollo
 * Reference: https://docs.apollo.io/reference/create-deal
 * POST https://api.apollo.io/api/v1/opportunities
 */
export async function createApolloOpportunity(opp: {
    name: string
    organization_id?: string | null
    organization_name?: string | null
    account_id?: string | null
    account_name?: string | null
    amount?: number | null
    stage?: string | null
    stage_id?: string | null
    stage_name?: string | null
    probability?: number | null
    close_date?: string | null
    description?: string | null
}): Promise<ApolloOpportunity> {
    const apiKey = await getApolloApiKey()
    
    const requestBody: Record<string, unknown> = {
        api_key: apiKey,
        name: opp.name,
    }
    
    // Apollo uses account_id for deals, not organization_id
    if (opp.account_id !== undefined && opp.account_id !== null) {
        requestBody.account_id = String(opp.account_id).trim()
    } else if (opp.organization_id !== undefined && opp.organization_id !== null) {
        // Fallback to organization_id for backward compatibility
        requestBody.account_id = String(opp.organization_id).trim()
    }
    if (opp.account_name !== undefined && opp.account_name !== null) {
        requestBody.account_name = String(opp.account_name).trim()
    } else if (opp.organization_name !== undefined && opp.organization_name !== null) {
        // Fallback to organization_name for backward compatibility
        requestBody.account_name = String(opp.organization_name).trim()
    }
    if (opp.amount !== undefined && opp.amount !== null) {
        requestBody.amount = opp.amount
    }
    // Apollo uses "stage_id" (preferred) or "stage_name" for the stage field
    // Prioritize stage_id when available, as it's more reliable
    if (opp.stage_id !== undefined && opp.stage_id !== null) {
        requestBody.stage_id = String(opp.stage_id).trim()
        console.log(`[Apollo API] Using stage_id: "${opp.stage_id}"`)
    } else if (opp.stage_name !== undefined && opp.stage_name !== null) {
        requestBody.stage_name = String(opp.stage_name).trim()
        console.log(`[Apollo API] Using stage_name: "${opp.stage_name}"`)
    } else if (opp.stage !== undefined && opp.stage !== null) {
        requestBody.stage = String(opp.stage).trim()
        console.log(`[Apollo API] Using stage: "${opp.stage}"`)
    }
    if (opp.probability !== undefined && opp.probability !== null) {
        requestBody.probability = opp.probability
    }
    if (opp.close_date !== undefined && opp.close_date !== null) {
        requestBody.close_date = String(opp.close_date).trim()
    }
    if (opp.description !== undefined && opp.description !== null) {
        requestBody.description = String(opp.description).trim()
    }
    
    const response = await fetch("https://api.apollo.io/api/v1/opportunities", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo create opportunity API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return apolloOpportunitySchema.parse(data.opportunity || data)
}

/**
 * Update an existing opportunity/deal in Apollo
 * Reference: https://docs.apollo.io/reference/update-deal
 * PATCH https://api.apollo.io/api/v1/opportunities/{opportunity_id}
 */
export async function updateApolloOpportunity(
    opportunityId: string,
    opp: {
        name?: string
        organization_id?: string | null
        organization_name?: string | null
        account_id?: string | null
        account_name?: string | null
        amount?: number | null
        stage?: string | null
        stage_id?: string | null
        stage_name?: string | null
        probability?: number | null
        close_date?: string | null
        description?: string | null
    }
): Promise<ApolloOpportunity> {
    const apiKey = await getApolloApiKey()
    
    const requestBody: Record<string, unknown> = {}
    
    if (opp.name !== undefined) {
        requestBody.name = String(opp.name).trim()
    }
    // Apollo uses account_id for deals, not organization_id
    if (opp.account_id !== undefined && opp.account_id !== null) {
        requestBody.account_id = String(opp.account_id).trim()
    } else if (opp.organization_id !== undefined && opp.organization_id !== null) {
        // Fallback to organization_id for backward compatibility
        requestBody.account_id = String(opp.organization_id).trim()
    }
    if (opp.account_name !== undefined && opp.account_name !== null) {
        requestBody.account_name = String(opp.account_name).trim()
    } else if (opp.organization_name !== undefined && opp.organization_name !== null) {
        // Fallback to organization_name for backward compatibility
        requestBody.account_name = String(opp.organization_name).trim()
    }
    if (opp.amount !== undefined && opp.amount !== null) {
        requestBody.amount = opp.amount
    }
    // Apollo uses "stage_id" (preferred) or "stage_name" for the stage field
    // Prioritize stage_id when available, as it's more reliable
    if (opp.stage_id !== undefined && opp.stage_id !== null) {
        requestBody.stage_id = String(opp.stage_id).trim()
        console.log(`[Apollo API] Using stage_id: "${opp.stage_id}"`)
    } else if (opp.stage_name !== undefined && opp.stage_name !== null) {
        requestBody.stage_name = String(opp.stage_name).trim()
        console.log(`[Apollo API] Using stage_name: "${opp.stage_name}"`)
    } else if (opp.stage !== undefined && opp.stage !== null) {
        requestBody.stage = String(opp.stage).trim()
        console.log(`[Apollo API] Using stage: "${opp.stage}"`)
    }
    if (opp.probability !== undefined && opp.probability !== null) {
        requestBody.probability = opp.probability
    }
    if (opp.close_date !== undefined && opp.close_date !== null) {
        requestBody.close_date = String(opp.close_date).trim()
    }
    if (opp.description !== undefined && opp.description !== null) {
        requestBody.description = String(opp.description).trim()
    }
    
    // Apollo API - use PATCH to /api/v1/opportunities/{opportunity_id} with api_key as query parameter
    // Reference: https://docs.apollo.io/reference/update-deal
    const url = new URL(`https://api.apollo.io/api/v1/opportunities/${opportunityId}`)
    url.searchParams.append("api_key", apiKey)
    
    const response = await fetch(url.toString(), {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Apollo update opportunity API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const parsed = apolloOpportunityUpdateResponseSchema.parse(data)
    return parsed.opportunity || apolloOpportunitySchema.parse(data)
}
