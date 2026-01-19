# Story: Backend Analytics Migration to Medusa Analytics Module

Date: 2026-01-19
Owner: Engineering
Status: Draft

## Objective
Replace direct PostHog calls and inconsistent logging with a unified Medusa Analytics Module implementation. Ensure all backend events (logs, workflows, subscribers, jobs, and APIs) are captured using Medusa-style event names and PII-safe properties. Use Local provider in dev and PostHog provider in prod.

## Scope
- Backend only (apps/backend)
- Frontend PostHog migration is explicitly out of scope

## Requirements
- Dev: Analytics Local provider with LOG_LEVEL=debug
- Prod: Analytics PostHog provider with POSTHOG_EVENTS_API_KEY and POSTHOG_HOST
- Medusa-style event naming (domain.action)
- PII masked in all analytics properties
- Log policy: case-by-case review, then log all info logs

---

## Plan (Detailed)

### Phase 0 — Baseline Inventory & Log Policy Review (Required)
1) Inventory existing event sources and log statements:
   - Subscribers: order.placed, order.canceled, fulfillment.created, customer.created, inventory.backordered
   - Workflows: create-order-from-stripe, cancel-order-with-refund, add-item-to-order, update-line-item-quantity, send-* email workflows
   - Workers/Jobs: stripe-event-worker, payment-capture-worker, email-worker, fallback-capture
   - APIs: Stripe webhook, order edit APIs, feedback, health, payment-intent lookup, admin stripe queue status
2) Build a tracking matrix:
   - Source -> log line -> decision (track or log-only) -> event name -> properties -> PII risk
3) Review case-by-case log policy and approve the set of logs to emit as analytics
4) After review, route all info logs to analytics (log.info)

Deliverable: approved tracking matrix and log policy

---

### Phase 1 — Analytics Module Configuration
1) Update apps/backend/medusa-config.ts
   - Dev: @medusajs/analytics-local
   - Prod: @medusajs/analytics-posthog
2) Add env vars:
   - POSTHOG_EVENTS_API_KEY
   - POSTHOG_HOST
   - LOG_LEVEL=debug in dev

---

### Phase 2 — Analytics Tracking Utilities
1) Add src/utils/analytics.ts (or equivalent)
   - Resolve Modules.ANALYTICS
   - trackEvent(event, actor_id, properties)
   - PII masking (email, address, phone, full names, tokens)
2) Provide a safe wrapper for logger -> analytics mapping

---

### Phase 3 — Replace Direct PostHog Events
Map existing PostHog events to Medusa-style names:
- order_placed -> order.placed
- backend_error -> backend.error
- health_check -> system.health_check
- redis_recovery_triggered -> recovery.redis_triggered
- backend_log_* -> log.info | log.warn | log.error

Remove direct posthog-node usage after migration.

---

### Phase 4 — Migrate Subscribers
Track these events through Analytics Module:
- order.canceled
- fulfillment.created
- customer.created
- inventory.backordered

Include actor_id (customer/system) and minimal business context (ids, counts).

---

### Phase 5 — Migrate Workflows
Add analytics for start/success/failure where critical:
- order.create.started|succeeded|failed
- order.cancel.started|succeeded|failed
- order.edit.add_item.started|succeeded|failed
- order.edit.update_quantity.started|succeeded|failed

Include order_id, payment_intent_id (masked), workflow_id, retry_count.

---

### Phase 6 — Migrate Workers & Jobs
Stripe pipeline:
- stripe.webhook.received
- stripe.webhook.duplicate
- stripe.webhook.queued
- stripe.webhook.invalid_signature
- stripe.worker.processed
- stripe.payment.authorized|captured|failed

Email pipeline:
- email.queued
- email.sent
- email.failed
- email.dlq

Fallback capture:
- recovery.redis_triggered
- capture.fallback.triggered
- capture.alert

---

### Phase 7 — Migrate Custom API Routes
Add analytics to custom endpoints:
- feedback.submitted
- order.address.updated
- order.payment_intent.lookup.found|not_found
- order.edit.init|confirm|update_item
- order.line_item.added|updated

---

### Phase 8 — Logger Strategy
After log policy review, emit all log levels to analytics:
- info -> log.info
- warn -> log.warn
- error -> log.error

Ensure PII masking in analytics properties.

---

### Phase 9 — Decommission posthog-node
- Remove src/utils/posthog.ts and dependent usages
- Remove posthog-node from backend package.json
- Ensure no regressions in tests

---

### Phase 10 — Validation
Dev:
- Local provider emits events to console (LOG_LEVEL=debug)

Prod:
- Verify PostHog receives events with correct names and properties
- Confirm no PII leakage

---

## Success Criteria
- All backend events tracked via Medusa Analytics Module
- Consistent Medusa-style event naming
- PII-safe analytics payloads
- No direct PostHog calls remain
- Log policy applied and all info logs captured

---

## Context: Relationship with Storefront `medusaFetch`

### Current State

The storefront (`apps/storefront`) uses `medusaFetch` for Medusa Store/Auth API calls. Under the hood, `medusaFetch` delegates to `monitoredFetch`, which tracks API request metrics (latency, status codes, errors) to PostHog. This is **complementary** to the Medusa Analytics Module, not redundant.

### Key Differences

| Aspect | Medusa Analytics Module (Backend) | monitoredFetch (Storefront) |
|--------|----------------------------------|---------------------------|
| **Location** | Server-side (Medusa) | Client-side (Cloudflare Workers) |
| **Events** | Business events (order.placed, cart.updated) | HTTP metrics (api_request) |
| **Data** | Rich context (order totals, items, customer_id) | Shallow (URL, status, duration_ms) |
| **Blocking** | Cannot be ad-blocked | Can be ad-blocked |

### Recommendation: Keep Both, Simplify Over Time

1. **After this migration:** Medusa Analytics Module handles all backend business events with rich context
2. **Storefront simplification (future):**
   - Remove business event tracking from `monitoredFetch` (e.g., order completion)
   - Keep `monitoredFetch` for pure performance monitoring only
   - Business events will be captured server-side with richer data
3. **Long-term:** Consider making `monitoredFetch` opt-in per endpoint rather than default-on

### Files Affected (for reference)

Storefront files currently using `medusaFetch` (which wraps `monitoredFetch`) for Medusa API calls:

- `api.carts.ts`, `api.payment-collections.ts`, `api.shipping-rates.ts`
- `order_.status.$id.tsx`, `checkout.success.tsx`
- Hooks: `usePaymentSession.ts`, `usePaymentCollection.ts`, `useMedusaProducts.ts`

These do NOT need to change as part of this backend migration. The backend Analytics Module will capture the same business events with richer context, making the storefront's shallow tracking redundant for business analytics (but still useful for client-side performance monitoring).
