# Content Clam

A Chrome extension that dims YouTube videos matching categories you choose to filter. Every dimmed video shows a reason and a Reveal button. A cute clam is its mascot.

Classification runs on [Jev by TypeSafe AI](https://docs.typesafe.ai). Pay with your own TypeSafe API key, or buy credits from the hosted service. The whole project, including the backend, is MIT licensed.

## Layout

| Directory | What it is |
|---|---|
| `extension/` | Chrome extension built with WXT, TypeScript, and React |
| `packages/shared/` | Category definitions, Jev request building, batching, and the dim decision. Used by the extension and the backend |
| `backend/` | Convex backend: accounts, settings sync, credits, billing receipts, Stripe purchases |
| `web/` | Small React site on Vercel for sign-in, buying credits, privacy, and support |
| `docs/` | Product plan, category definitions, implementation sequence, and architecture decisions |

## Run the extension with your own key

You do not need an account or any backend for this.

```sh
pnpm install
pnpm --filter @content-clam/extension dev
```

WXT opens Chrome with the extension loaded. Open the extension settings, pick "My own TypeSafe API key", and paste a key from TypeSafe. The key stays in local extension storage on that device.

## Self-host the whole service

1. Create a Clerk application, enable the Convex integration in the Clerk dashboard, and turn on email codes and Google sign-in.
2. In `backend/`, run `npx convex dev` and set the variables listed in `backend/.env.example` on the deployment.
3. In `web/`, copy `.env.example` to `.env.local`, fill it in, and run `pnpm dev`. Deploy to Vercel with the same variables.
4. In `extension/`, copy `.env.example` to `.env`. Set the sync host to the website URL so the extension shares its Clerk session. Add the extension's `chrome-extension://<id>` origin to the Clerk instance's allowed origins.
5. Create three one-time Stripe prices and set their IDs on the Convex deployment. Point a Stripe webhook at `https://<deployment>.convex.site/stripe/webhook`.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm --filter @content-clam/extension build
```

## Documents

- [Product plan](docs/plan.md)
- [Category definitions](docs/categories.md)
- [Implementation sequence and release checks](docs/implementation.md)
- [Glossary](CONTEXT.md)
- [Architecture decisions](docs/adr/)
