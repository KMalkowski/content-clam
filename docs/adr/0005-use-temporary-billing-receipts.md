# Use temporary billing receipts

Permanent usage accounting consists of a credit balance, total charged analyses, and purchase records. Those totals cannot identify whether an interrupted request was already charged, so retain temporary receipts with opaque operation IDs and billing status. Receipts contain no video identifiers, metadata, prompts, or classification results.

Retries repeat provider work if necessary but do not deduct another credit. Delete receipts after a bounded retry window and reject expired retries rather than silently charging again. This accepts extra inference cost while bounding per-operation storage and preserving reliable billing.
