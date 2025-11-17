import type {App} from "attio"
import {showDialog} from "attio/client"

import {ApolloSyncDialog} from "./apollo-sync-dialog"

export const apolloSyncAction: App.Record.Action = {
    id: "apollo-sync",
    label: "Apollo Sync",
    onTrigger: async ({recordId}) => {
        showDialog({
            title: "Apollo Sync",
            Dialog: () => {
                return <ApolloSyncDialog recordId={recordId} />
            },
        })
    },
}

