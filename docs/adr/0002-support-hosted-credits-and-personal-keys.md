# Support hosted credits and personal Jev keys

Viewers can buy prepaid analyses through the service or use their own Jev API key without creating a service account. Personal keys stay in the extension without sync, and requests go directly to TypeSafe. This gives open-source users an independent way to pay for inference while keeping our shared service key off their devices.

Use Convex for the hosted backend and Stripe for credit purchases, following the project owner's stack preference. The server owns hosted credit balances and payment records. Both modes must apply the same category definitions and filtering rules, despite using different payment paths.
