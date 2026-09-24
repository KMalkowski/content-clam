# Sync settings without classification history

Hosted-credit accounts sync category definitions, toggles, allowed topics, and allowed channels through Convex. Saved classifications remain on each device. The user wants consistent filtering preferences across devices without a server-side classification history.

Each device analyzes its own visible feed. The same video can therefore consume a new credit on another device.

Even temporary analysis results must not be stored on the server. Failed requests repeat the provider work. See ADR 0004 for the storage boundary and ADR 0005 for the permitted payment bookkeeping.

The extension keeps its sync choice and last-uploaded snapshot per account, so switching accounts in the same browser asks the conflict question again and never uploads one account's settings under another. Devices still fetch account settings only on request; automatic delivery to other devices is deferred.
