# Checkout experiment

`checkout_single_page_v1` compares the existing shipping → payment checkout with a single page showing both sections. The treatment hides the intermediate Continue/Back controls, redundant country selector, and optional referral survey. Existing payment providers and address validation remain in use.

Assignment: salted SHA-256 of the persistent browser visitor ID, first byte < 128 = control, otherwise single_page. This gives a 50/50 probability, not a forced equal count. A browser keeps its version across tabs. Enrollment waits for a nonempty checkout cart. Visitors without usable storage are not enrolled.

Unit: tab checkout session (`si-session-id`), deduplicated across reloads. A return in a new tab is a new session in the same visitor bucket. This differs from the older visitor-based cart tests and may differ from the historical 50% baseline.

Primary outcome: sessions with a confirmed paid order / enrolled sessions. `fulfillOrder` records payments server-side for Square, PayPal/Venmo, QuickBooks and other existing fulfillment callers. Success-page visits cannot credit this experiment. Purchases require a known enrolled session; reloads and repeated callbacks do not increase conversion. Revenue counts each distinct paid order once, including repeat orders. Counters and deduplication keys are retained for 120 days.

Results: `/admin/tests` (authenticated). Guardrails: sessions with a client-reported payment failure / sessions; paid revenue / sessions; revenue / orders (AOV). Payment-error tracking is best-effort client telemetry, so blocked tracking may undercount failures. Assignment/storage failures are logged; checkout continues during outages. Redis counter writes are atomic Lua operations.

A statistical readout should use a prespecified sample size and run across full business cycles. Do not interpret the older cart-test confidence heuristic as a checkout stopping rule. Returning sessions share visitors, so session observations are not fully independent. No automatic winner is selected.

Existing shipping and cart experiments continue; their assignment is independent of this test. No discounts or shipping policy changes are part of this experiment.

Stop new enrollments and show control: set `CHECKOUT_EXPERIMENT_DISABLED=1` for the Vercel environment and redeploy. Existing enrolled paid orders can still complete and be counted. To resume, remove it and redeploy. For a full rollback, restore the preceding Vercel production deployment.

Validation: `npm run test:checkout` exercises stable allocation, Lua enrollment, repeated exposure/payment callbacks, failures, unknown sessions, repeat orders and invalid amounts using an in-memory Redis implementation. `npm run build` validates Next.js compilation, linting and static routes. Browser checks cover both rendered layouts and required-field blocking. No live charge is needed for these checks.
