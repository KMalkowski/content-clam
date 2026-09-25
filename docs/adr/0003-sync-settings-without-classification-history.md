# Sync settings without classification history

Hosted-credit accounts sync category definitions, toggles, allowed topics, and allowed channels through Convex. Saved classifications remain on each device. The user wants consistent filtering preferences across devices without a server-side classification history.

Each device analyzes its own visible feed. The same video can therefore consume a new credit on another device.

Even temporary analysis results must not be stored on the server. Failed requests repeat the provider work. See ADR 0004 for the storage boundary and ADR 0005 for the permitted payment bookkeeping.

The extension keeps its sync choice and last-uploaded snapshot per account, so switching accounts in the same browser asks the conflict question again and never uploads one account's settings under another. If the account changes while an upload is in flight, the device ignores the result and sends the changes again the next time that account syncs.

Each upload sends only what changed since the last snapshot. The server keeps whichever version of an item has the later timestamp. A deletion counts as a timestamped change, so a device with an older copy can't bring the item back. The server keeps deletion records for 180 days. A device that has been offline longer than that can still restore an item that another device deleted.

The upload returns the account's current settings, and the device merges them in, keeping any local edits made while the upload was in flight. So a device picks up other devices' changes the next time it uploads its own. A failed upload shows an error in the extension settings and retries with a growing delay, up to 30 minutes. A retry keeps the time each deletion and pause change was first made, so waiting to retry doesn't make an old change win. Devices do not poll for changes. Automatic delivery to idle devices is still deferred.
