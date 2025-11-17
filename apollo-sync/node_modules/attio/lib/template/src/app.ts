import type {App} from "attio"

import {helloWorldAction} from "./hello-world-action"

export const app: App = {
    record: {
        /** @see https://docs.attio.com/sdk/entry-points/record-action  */
        actions: [helloWorldAction],
        /** @see https://docs.attio.com/sdk/entry-points/bulk-record-action */
        bulkActions: [],
        /** @see https://docs.attio.com/sdk/entry-points/record-widget */
        widgets: [],
    },
    callRecording: {
        /** @see https://docs.attio.com/sdk/entry-points/call-recording-insight-text-selection-action */
        insight: {
            textActions: [],
        },
        /** @see https://docs.attio.com/sdk/entry-points/call-recording-summary-text-selection-action */
        summary: {
            textActions: [],
        },
        /** @see https://docs.attio.com/sdk/entry-points/call-recording-transcript-text-selection-action */
        transcript: {
            textActions: [],
        },
    },
}
