import type {App} from "attio"
import {showDialog} from "attio/client"

import {HelloWorldDialog} from "./hello-world-dialog"

export const helloWorldAction: App.Record.Action = {
    id: "apollo-sync",
    label: "Apollo Sync",
    onTrigger: async ({recordId}) => {
        showDialog({
            title: "Apollo Sync",
            Dialog: () => {
                // This is a React component. It can use hooks and render other components.
                return <HelloWorldDialog recordId={recordId} />
            },
        })
    },
}
