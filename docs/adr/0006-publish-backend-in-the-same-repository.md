# Publish the backend in the same repository

The extension, the Convex backend, the sign-in website, and the shared classification code live in one MIT-licensed repository.

The backend holds no secret logic. It stores accounts, settings, balances, and payment records, and forwards classification requests to TypeSafe with the service key. Every secret lives in deployment environment variables, never in source. Publishing the code therefore reveals nothing an attacker could use, and it lets self-hosters run the whole system with their own accounts.

Sharing one repository keeps the classification rules, request batching, and result validation in a single package used by both the personal-key path and the hosted path. A private backend repository would have to copy or publish that package separately.

The hosted service competes on convenience, not on hidden code. Its name and mascot are protected by trademark, not by the license.
