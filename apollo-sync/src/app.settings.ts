import type {SettingsSchema} from "attio"

export const settingsSchema: SettingsSchema = {
    workspace: {},
    connections: {
        apollo: {
            label: "Apollo",
            description: "Connect to Apollo.io to sync contacts",
            fields: {
                value: {
                    label: "API Key",
                    type: "string",
                    required: true,
                    secret: true,
                },
            },
        },
    },
} as SettingsSchema

export default settingsSchema
