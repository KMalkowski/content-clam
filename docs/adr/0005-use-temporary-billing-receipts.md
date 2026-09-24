# Use temporary billing receipts

Permanent usage accounting consists of a credit balance, total charged analyses, and purchase records. Those totals cannot identify whether an interrupted request was already charged, so retain temporary receipts with opaque operation IDs and billing status. Receipts contain no video identifiers, metadata, prompts, or classification results.

Retries repeat provider work if necessary but do not deduct another credit. Delete receipts after a bounded retry window and reject expired retries rather than silently charging again. This accepts extra inference cost while bounding per-operation storage and preserving reliable billing.

Operation IDs carry their creation time, so expiry is checked from the ID itself and does not depend on the receipt still existing. Each receipt stores a one-way hash of the original request so a paid ID cannot be reused for different work, and a short attempt lease so only the attempt that holds the reservation can charge or release it.

The server rejects operation IDs dated further ahead than a small clock skew, so a client cannot extend a receipt's life by post-dating it. The request hash covers a canonical serialization of every field forwarded to the provider. Once an operation expires, the extension keeps it in an expired state and stops retrying it automatically; a fresh paid request requires a new video or changed rules.
