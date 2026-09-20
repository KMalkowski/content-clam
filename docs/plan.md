# Content Clam

## Brief

Content Clam is a public, open-source browser extension that helps people avoid regretted clicks on YouTube. It uses Jev by TypeSafe AI to classify video metadata against categories the user chooses to filter. Its mascot is a cute clam.

Videos stay visible unless there is evidence that they match a selected filter. A video does not need to prove educational value or match the user's interests to remain visible. Excellent videos outside familiar subjects should survive.

Implementation has started. The repository layout is described in the README, and ADR 0006 explains why the backend is published alongside the extension.

## Deferred launch decisions

- Set credit pack prices after cost measurement.
- Choose the public domain and support email, and configure production service accounts.
- Finalize account deletion and remaining-credit handling before opening paid accounts to the public. The proposed policy removes settings and authentication data, retains required payment records, and explains any loss of unused credits before deletion.

These do not block implementation. The architecture, first-release scope, and data-storage boundary are settled. Provider latency, metadata quality, Shorts playback control, and session refresh must still be verified in prototypes.

## Agreed direction

- Judge usefulness by fewer regretted clicks during a personal browsing trial. Use the agreed reviewed sample and release checks in implementation.md to assess category accuracy without product telemetry.
- Enable six built-in categories by default: clickbait, outrage bait, gossip and drama, reactions with little added analysis, pranks and stunts, and promotion and hype. Make disabling individual categories easy.
- Users can edit built-in category descriptions and create their own categories with descriptions. Built-in definitions can be reset.
- Dim matching videos, show a short reason, and provide a control to reveal them.
- Publish the extension and its source code.
- Use the MIT license.
- Start with desktop Chrome. Safari and other browsers may follow.
- Cover Home, search, subscriptions, watch-page recommendations, and Shorts in the first release.
- The project owner is comfortable sending useful video information for classification. Explain the destination and purpose of processing before users activate hosted or personal-key classification.
- Sell prepaid credits for curation and support a personal Jev API key as an alternative.
- Saved classifications keep working after credits run out.
- Grant 100 trial analyses once per verified email account, with signup rate limits and a service-wide trial budget. Some abuse is an accepted trade-off.
- One credit pays for one successfully completed video analysis covering enabled categories and topic exceptions, even if the provider work needs multiple requests.
- Support up to 100 categories and 100 allowed topics, with up to 2,000 characters per description. Split large collections into bounded provider requests. Real latency and cost still need testing.
- Reusing saved results and retrying the same operation must not charge again. Changed definitions can require a new paid analysis; explain that before saving.
- Personal-key mode requires no account with this service. Store the key locally in the extension, without sync, and send requests directly to TypeSafe through the extension background worker. Local storage is not a secure vault.
- Postpone personal profiles and knowledge tracking.
- Dim Shorts cards. Pause a matching Short in the player and offer a way to play it anyway. Reliable playback control still requires a prototype.
- Offer an always-allow exception for a channel.
- Offer a Hide Shorts switch that removes Shorts without analysis or credits. Shelves below the fold are removed; anything already visible is blurred in place to avoid layout shift.
- Allowed topics override every category filter, including clickbait. Match the video's main subject rather than passing keywords. Explain this effect in settings.
- Allowed channels bypass analysis. Topic exceptions generally require analysis and therefore consume a credit when no reusable result exists.
- Revealing an individual video does not change future filtering rules.
- Leave ordinary cards visible while classification is pending. Allow Shorts playback to start, then pause on a confident filter match. Errors and uncertain results leave content available.
- Version one uses only metadata already available on the page. Do not fetch transcripts or add thumbnail analysis. Optional transcript use can be considered later; availability is not guaranteed.
- Use Convex for the backend and Stripe for payments.
- Use conservative matching without a confidence slider in the first release. Tune thresholds against real examples.
- Keep the interface in English. Send metadata in other languages to Jev without translation or language-specific handling. Do not claim equal accuracy across languages without testing.
- Sell one-time credit packs without subscriptions, automatic top-ups, or expiry. Set prices after measuring representative usage.
- Users explicitly choose credits or a personal key. Never switch funding sources automatically.
- Apply category and topic edits to visible videos and future browsing. Reuse valid results; do not reanalyze the whole local history. Explain possible charges before saving.
- Analyze visible cards and cards up to 1,000 pixels below the viewport. Do not analyze the whole loaded page. Prioritize visible cards over upcoming ones.
- Cache classifications locally for 30 days. Changes to relevant metadata or definitions can invalidate a result sooner. Reanalysis after expiry can consume another credit.
- Do not add a wrong-category action or collect classification feedback in version one. Users can edit their own rules.
- Offer support by email, including case-by-case refund requests. Do not build self-service refunds. Aim for a cheap entry pack, potentially around $1; exact pricing remains open.

## Settings and data

Store settings and saved classifications locally. Offer JSON settings export and import, excluding API keys.

For accounts using hosted credits, also store settings in Convex so they follow the user across devices. Synced settings include category definitions, category toggles, allowed topics, and allowed channels. Do not sync classification history. Another device analyzes the videos on its page and spends credits for those fresh analyses.

Sync individual settings changes. If devices edit the same item, the last saved edit wins. On first sign-in, ask whether to use account settings or keep local settings if they differ. Signed-in personal-key users can retain settings sync. Personal keys and the active funding mode remain device-specific.

Convex stores accounts, settings, balances, and payment information. Do not persist specific video analyses, metadata, results, or classification history on the server, even temporarily. Keep analysis inputs and outputs in memory only while processing the request; save results on the device. Do not include them in logs, traces, analytics, durable jobs, or error reports. Verify the hosting platforms' request logging and retention behavior before making a public privacy claim. Never sync personal API keys.

If a classification request fails, repeat the work instead of recovering a stored server result. Additional provider cost from retries is acceptable.

Keep permanent aggregate payment information: credit balance, total charged analyses, and purchase records. Keep temporary billing receipts containing an opaque operation ID and billing status to prevent duplicate charges. They may also carry the owner, credit amount, and expiry needed for accounting, but never video identifiers, metadata, prompts, or results. Delete receipts after a bounded retry window. Expired operations must stop retrying rather than silently become another paid request.

The same retry uses the same operation ID, stored on the client before sending. Scope receipts to their account and bind retry authorization to the original work without persisting video data. Finalize and test that mechanism during the billing prototype. A receipt can suppress a second debit but cannot recover a result; repeat provider work when needed.

These storage rules govern Content Clam. TypeSafe processes metadata under its own retention terms, which must be disclosed separately.

## Interface

The popup contains a master pause switch, category toggles, credit balance or personal-key status, and a link to full settings. Full settings contain category descriptions, allowed channels and topics, account and payment controls, and import/export.

A dimmed card shows a short reason and a Reveal control. Its menu offers a channel exception and access to the matching filter's settings. If several filters match, disabling one does not override the others.

## Accounts and payments

Use Clerk with email verification codes and Google sign-in. Its Chrome Extension SDK supports email verification and background-worker token refresh, and Convex documents a Clerk integration.

Clerk's supported Google flow uses a regular browser tab and Sync Host, rather than OAuth inside the extension popup. Use one small React website on Vercel for Google and email sign-in, payment return pages, privacy information, and support. Share the Clerk instance between that page and the extension. Validate session sync and refresh in the first prototype.

Use one-time Stripe Checkout payments. The server owns pack definitions and credit quantities. Grant credits only after confirmed payment and only once per purchase, including delayed payment methods. Reserve an analysis credit before calling Jev; complete the debit after success or release it after failure. Use the temporary billing receipt and an atomic balance update to prevent retries from charging twice. Increment total charged analyses only on the first successful debit.

Sources: [Clerk extension SDK](https://clerk.com/docs/references/chrome-extension/overview), [Convex Clerk integration](https://docs.convex.dev/auth/clerk), [Convex Stripe component](https://github.com/get-convex/stripe), [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment).

Google flow sources: [Clerk Sync Host](https://clerk.com/docs/guides/sessions/sync-host), [Chrome extension authentication methods](https://clerk.com/docs/reference/chrome-extension/overview), [extension production setup](https://clerk.com/docs/guides/development/deployment/chrome-extension).

## Extension stack

Use WXT and TypeScript for a Chrome Manifest V3 extension, with React for settings and account screens. Use content scripts for extracting metadata and displaying filters, and the extension background worker for network requests.

WXT documents YouTube navigation and dynamic UI mounting. YouTube integration still needs tests for scrolling, reused cards, and Shorts transitions. Persist work across background worker restarts and prevent duplicate charges on retries.

Sources: [WXT content scripts](https://wxt.dev/guide/essentials/content-scripts.html), [Chrome network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [background worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

## Verified model capabilities

Jev accepts text and structured JSON. It supports overlapping classifications through independent yes/no probability questions. It does not read thumbnails or generate free-form explanations. Reasons can use predefined text tied to matched categories.

Official documentation lists model `jev-1.13.0` at $0.042 per million input tokens, with free output, checked on September 20, 2026. Product pricing must also cover infrastructure, payment fees, and other services. Real classification quality and latency need testing.

Sources: [API](https://docs.typesafe.ai/api), [input format](https://docs.typesafe.ai/concepts/state), [models and pricing](https://docs.typesafe.ai/models), [limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

### Large rule collections

Jev currently limits state plus all questions to 64k tokens, and state plus the longest question to 32k tokens. There is no documented token-count endpoint or explicit maximum question count in the reviewed API. Do not estimate an exact token count from characters or assume unlimited questions.

Supply bounded video metadata as shared state and each rule's name and full description in its own independent yes/no question. Batch the questions conservatively, then tune using returned input-token usage. Split a batch again only for a confirmed context-size or question-count rejection. If a single rule cannot be evaluated, fail clearly rather than silently dropping it.

Combine results by stable rule IDs after every required question succeeds. Reserve one credit for the logical video analysis, complete one debit on success, and release the reservation on failure. Retry unfinished work without duplicate customer charges. Large collections repeat metadata across requests and therefore cost more and take longer. Price packs using measurements that include this case.

## Documentation

Record agreed terminology in CONTEXT.md. Update this plan as decisions are made. Create an ADR when a decision has a lasting cost and its reasons would otherwise be lost.
