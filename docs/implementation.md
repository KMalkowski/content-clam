# Content Clam implementation plan

The first pass of every section below exists in the repository. Items in section 1 still need testing against the live YouTube page and real accounts.

## 1. Prove the uncertain parts

- Extract page metadata from Home, search, subscriptions, recommendations, and Shorts. Check navigation without a reload, scrolling, and reused video cards.
- Dim a card without blocking unrelated controls. Pause only a matching active Short and ensure Play anyway survives player updates for that Short.
- Call Jev from an extension background worker using a personal key. Measure ordinary and maximum-size rule collections, including multiple requests when required.
- Test Clerk email and Google sign-in, token refresh, browser restarts, and expired sessions.
- Evaluate the default category definitions against a reviewed video sample. Metadata may be insufficient to distinguish some categories; tune or narrow definitions before promising reliable filtering.

## 2. Build local curation

- WXT, TypeScript, React, Chrome Manifest V3.
- Keep YouTube DOM extraction separate from rule evaluation and presentation.
- Read only metadata available on the page. Deduplicate video cards, prioritize visible content, and include a 1,000-pixel lookahead below the viewport.
- Share classification rules and result validation between personal-key and hosted modes.
- Implement category editing, topic and channel exceptions, dimming reasons, reveal controls, and Shorts playback handling.
- Add the popup, full settings, local cache, settings import/export, and local personal-key storage.
- Use the Content Clam name and a cute clam mascot across onboarding, settings, and store assets. Keep mascot artwork out of video overlays so reasons and controls remain easy to scan.
- Preserve all matches internally so changing one filter does not accidentally erase another match.
- Treat video metadata as untrusted input, never as model instructions. Render user and page text as text, not HTML.

## 3. Add accounts and hosted analyses

- Clerk identity verified by Convex. Never trust a client-provided user ID or balance.
- Sync settings per item, with explicit first-sign-in conflict handling. Do not sync classifications or personal keys.
- Grant the trial once after verified authentication. Apply signup and request rate limits and a service-wide trial budget.
- Keep permanent balances, total charged analyses, and purchase records. Use temporary receipts with opaque operation IDs and billing status to prevent duplicate charges. Do not persist analysis inputs, results, or history.
- Reserve a credit atomically before provider work, within the agreed payment storage boundary.
- Complete one debit after a successful analysis. Provider request splitting must not multiply the customer charge. Failed work releases its reservation.
- Repeat failed or interrupted provider work; keep recovered or completed classifications on the client only. Duplicate-charge prevention must respect the agreed payment storage boundary.
- Persist the operation ID on the client before sending. Scope billing receipts to the account and bind retries to the original work without storing video data. Delete expired receipts, reject expired retries, and test interrupted reservations and concurrent retries.
- Avoid analysis data in server logs, traces, error reports, and durable jobs. Verify infrastructure behavior in the prototype.
- Keep hosted and personal-key funding explicit. Never fall back automatically.

## 4. Add purchases

- Use the Convex Stripe component and one-time hosted Checkout.
- Keep packs and their credit quantities server-controlled.
- Grant credits only after confirmed payment. Handle repeated events and delayed payment confirmation without duplicate grants.
- Show balances and purchase status. Reconcile abandoned or delayed payment flows.
- Use Stripe test mode until launch pricing and support details are ready.

## 5. Prepare publication

- Run the agreed release checks, including charges under retries and concurrent requests.
- Measure inference, hosting, authentication, and payment costs before setting pack prices. Include heavy custom-rule use and trial abuse in estimates.
- Add MIT licensing, contributor setup, self-hosting instructions, and configuration examples without secrets.
- Explain external processing before activation. Document the distinction between hosted requests and direct TypeSafe requests.
- Provide privacy, support, and payment terms. Finalize account deletion and remaining-credit handling before public launch. Do not claim TypeSafe has zero retention for ordinary accounts.
- Package the extension with narrowly scoped permissions and bundled code. Prepare Chrome Web Store assets and the supporting website.
- Host the small React website on Vercel, with Clerk sign-in and Convex backend integration.

## Release checks

These checks are agreed.

- Review at least 200 videos, including useful content with sensational titles, expert reactions, ordinary product reviews, and matches to multiple rules.
- At least 90% of dimmed examples should actually match an enabled definition and have no applicable exception. Also inspect missed matches so a system that never dims anything cannot pass.
- Run a personal browsing trial to assess regretted clicks without adding product telemetry or a feedback collection feature.
- Confirm filtering on all five requested surfaces, including Shorts navigation and Play anyway.
- Verify local expiry, edits, synced settings conflicts, offline behavior, failed requests, and empty balances.
- Verify exactly one customer debit per successful logical analysis under retries, concurrency, worker restarts, and split provider requests. Failed analyses must not debit credits.
- Verify temporary billing receipts are cleaned up, expired retries cannot cause new charges, and analysis data never enters server persistence or application logs.
- Verify purchase fulfillment is idempotent and users cannot access another account's settings or credits.
- Record latency and cost for typical and maximum-size settings. Decide whether observed delays are acceptable before public release.
