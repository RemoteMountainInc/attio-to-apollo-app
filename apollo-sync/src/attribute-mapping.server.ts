/**
 * Attribute mapping between Attio and Apollo
 * Maps Attio attribute names to Apollo field names
 */

/**
 * Extract a value from Attio's attribute format
 * Attio stores attributes as arrays: [{ value: "...", ... }] or [{ option: { title: "..." } }]
 */
function extractAttioValue(attioData: unknown): string | null {
    if (!attioData) return null
    
    // If it's an array, get the first entry
    if (Array.isArray(attioData) && attioData.length > 0) {
        const entry = attioData[0]
        
        // For select attributes: { option: { title: "..." } }
        if (entry?.option?.title) {
            return String(entry.option.title)
        }
        
        // For text/number attributes: { value: "..." }
        if (entry?.value !== undefined && entry?.value !== null) {
            return String(entry.value)
        }
        
        // For name attributes: { first_name: "...", last_name: "..." }
        if (entry?.first_name || entry?.last_name) {
            // Return full name if available, otherwise first or last
            if (entry.full_name) return String(entry.full_name)
            if (entry.first_name && entry.last_name) {
                return `${entry.first_name} ${entry.last_name}`.trim()
            }
            return String(entry.first_name || entry.last_name || "")
        }
        
        // For email addresses: { email_address: "..." }
        if (entry?.email_address) {
            return String(entry.email_address)
        }
        
        // For phone numbers: { phone_number: "..." }
        if (entry?.phone_number) {
            return String(entry.phone_number)
        }
        
        // Fallback: try common fields
        return entry?.title || entry?.name || entry?.label || null
    }
    
    // If it's a direct value
    if (typeof attioData === 'string' || typeof attioData === 'number') {
        return String(attioData)
    }
    
    // If it's an object
    if (typeof attioData === 'object' && attioData !== null) {
        const obj = attioData as Record<string, unknown>
        const value = obj.value
        const title = obj.title
        const name = obj.name
        const label = obj.label
        // Ensure we return string | null, not {} | null
        if (typeof value === 'string') return value
        if (typeof title === 'string') return title
        if (typeof name === 'string') return name
        if (typeof label === 'string') return label
        return null
    }
    
    return null
}

/**
 * Extract phone number from Attio phone_numbers array
 * @deprecated Not currently used
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unused-vars-experimental
function extractPhoneNumber(_phoneNumbers: unknown): string | null {
    if (!_phoneNumbers) return null
    
    if (Array.isArray(_phoneNumbers) && _phoneNumbers.length > 0) {
        const firstPhone = _phoneNumbers[0]
        if (firstPhone?.phone_number) {
            return String(firstPhone.phone_number)
        }
        if (firstPhone?.value) {
            return String(firstPhone.value)
        }
    }
    
    return null
}

/**
 * Extract all mappable attributes from Attio record values
 * Returns an object with Apollo field names as keys
 */
export function extractAttioAttributes(attioValues: Record<string, unknown>): Record<string, string | null> {
    const apolloFields: Record<string, string | null> = {}
    
    // Map common Attio attributes to Apollo fields
    // Job Title
    if (attioValues.job_title) {
        apolloFields.title = extractAttioValue(attioValues.job_title)
    }
    
    // Company/Organization
    if (attioValues.company) {
        // Company might be an object reference: { id: "...", title: "Company Name" }
        const companyValue = extractAttioValue(attioValues.company)
        if (companyValue) {
            apolloFields.organization_name = companyValue
        }
    }
    
    // Phone Number - REMOVED: Not syncing phone numbers to avoid errors
    
    // LinkedIn URL
    if (attioValues.linkedin) {
        const linkedinValue = extractAttioValue(attioValues.linkedin)
        if (linkedinValue) {
            // Ensure it's a full URL
            if (linkedinValue.startsWith('http')) {
                apolloFields.linkedin_url = linkedinValue
            } else if (linkedinValue.startsWith('linkedin.com') || linkedinValue.startsWith('/')) {
                apolloFields.linkedin_url = `https://${linkedinValue.replace(/^\/+/, '')}`
            } else {
                apolloFields.linkedin_url = `https://linkedin.com/in/${linkedinValue}`
            }
        }
    }
    
    // Twitter URL
    if (attioValues.twitter) {
        const twitterValue = extractAttioValue(attioValues.twitter)
        if (twitterValue) {
            if (twitterValue.startsWith('http')) {
                apolloFields.twitter_url = twitterValue
            } else if (twitterValue.startsWith('twitter.com') || twitterValue.startsWith('x.com')) {
                apolloFields.twitter_url = `https://${twitterValue}`
            } else {
                apolloFields.twitter_url = `https://twitter.com/${twitterValue.replace(/^@/, '')}`
            }
        }
    }
    
    // Facebook URL
    if (attioValues.facebook) {
        const facebookValue = extractAttioValue(attioValues.facebook)
        if (facebookValue) {
            if (facebookValue.startsWith('http')) {
                apolloFields.facebook_url = facebookValue
            } else {
                apolloFields.facebook_url = `https://facebook.com/${facebookValue}`
            }
        }
    }
    
    // Instagram URL
    if (attioValues.instagram) {
        const instagramValue = extractAttioValue(attioValues.instagram)
        if (instagramValue) {
            if (instagramValue.startsWith('http')) {
                apolloFields.instagram_url = instagramValue
            } else {
                apolloFields.instagram_url = `https://instagram.com/${instagramValue.replace(/^@/, '')}`
            }
        }
    }
    
    // Description/Bio
    if (attioValues.description) {
        apolloFields.bio = extractAttioValue(attioValues.description)
    }
    
    // Location (from primary_location)
    if (attioValues.primary_location) {
        const locationValue = extractAttioValue(attioValues.primary_location)
        if (locationValue) {
            // Apollo uses separate fields for location, but we can use city/state/country
            // For now, store in a custom field or parse if needed
            // apolloFields.city = ...
            // apolloFields.state = ...
            // apolloFields.country = ...
        }
    }
    
    // Log what we extracted
    console.log(`[Attribute Mapping] Extracted ${Object.keys(apolloFields).length} attributes from Attio:`, Object.keys(apolloFields))
    
    return apolloFields
}

