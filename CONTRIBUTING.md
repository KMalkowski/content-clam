# Contributing

Bug reports, fixes, and category ideas are welcome. For anything bigger than a small fix, open an issue first so we can agree on the approach before you write code.

## Setup

You need Node 22 and pnpm 10. Run `corepack enable` once if pnpm is missing.

```sh
pnpm install
pnpm dev:extension
```

WXT opens Chrome with the extension loaded. Pick "My own TypeSafe API key" in the settings and paste a key. You don't need an account or the backend to work on the extension.

To work on accounts, credits, or sync, follow "Self-host the whole service" in the [README](README.md) to run your own Clerk, Convex, and Stripe test setup.

## Before you open a pull request

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI runs the same four commands. `pnpm format` fixes most lint and formatting problems.

If you change YouTube extraction or dimming, try the change by hand on Home, search, Subscriptions, the watch page sidebar, and Shorts. YouTube changes its markup often, and the tests can't catch that.

## Rules the code must keep

- Video titles, descriptions, and classification results never go into the database, server logs, or error reports. See [ADR 0004](docs/adr/0004-keep-all-analysis-results-on-device.md).
- A personal TypeSafe key stays in local extension storage. It is never synced or sent to our backend.
- Hosted credits and a personal key are separate choices. The extension never switches from one to the other on its own.
- Page text is untrusted. Render it as text, never as HTML, and never treat it as instructions to the model.
- One successful analysis costs exactly one credit, even with retries. Billing changes need tests in `backend/convex/billing.test.ts`.

## Where things are described

- [CONTEXT.md](CONTEXT.md) defines the words we use, like "credits" and "keep subscriptions". Use the same words in code and docs.
- [docs/adr/](docs/adr/) records past decisions. If your change goes against one, say so in the pull request, and add a new ADR if it's accepted.
- [docs/categories.md](docs/categories.md) has the default category definitions.

## Code style

Biome formats and lints the code. Keep comments rare and let names explain the code.

## License

By contributing, you agree that your work is released under the [MIT License](LICENSE).
