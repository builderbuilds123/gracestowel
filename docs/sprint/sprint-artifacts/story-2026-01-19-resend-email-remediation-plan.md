# Story: Resend Email Remediation Plan (Medusa v2)

Date: 2026-01-19
Owner: Engineering
Status: Done

## Objective
Bring the backend email system into alignment with Medusa Resend integration guidance and project email requirements. Address correctness, PII safety, delivery guarantees, and maintainability, while preserving non-blocking order flows.

## Scope

- Backend only (`apps/backend`)
- Notification/Resend provider, email queue/worker, and email-related subscribers/workflows
- No frontend changes

## References

- Medusa Resend guide: <https://docs.medusajs.com/resources/integrations/guides/resend>
- Project email requirements: `docs/product/epics/transactional-email-epics.md`
- Email architecture: `docs/product/architecture/transactional-email-architecture.md`

---

## Current State Summary

- Resend provider exists in `apps/backend/src/modules/resend` and is registered in `medusa-config.ts`.
- Order confirmation emails are queued via BullMQ; other templates (welcome, shipping confirmation, order canceled) still send synchronously via workflows.
- Provider logs full recipient and payload (PII risk).
- Provider uses `process.env` to determine “test mode,” which can silently disable sending even when config options are supplied.
- Queue retries/DLQ currently apply to order confirmation only.

---

## Tasks

### Priority 0 — Compliance & Correctness (Blockers)

- [x] **Remove PII from provider logs**
  - [x] Stop logging raw recipient addresses and full payloads in `ResendNotificationProviderService`
  - [x] Use `maskEmail` and log only template + order/customer IDs

- [x] **Fix provider option handling**
  - [x] Ensure provider uses injected `options` instead of reading `process.env` at runtime for test mode
  - [x] Enforce required `api_key` and `from` in `validateOptions` per Medusa guide
  - [x] If test mode is desired, gate it explicitly via a dedicated option (never auto-infer from env in production)

### Priority 1 — Delivery Guarantees

- [x] **Standardize all email sending through the queue**
  - [x] Expand `EmailJobPayload.template` to support all templates
  - [x] Modify welcome, shipping-confirmation, and order-canceled flows to enqueue instead of direct send
  - [x] Keep workflows for data assembly, but output should enqueue

- [x] **Extend retry + DLQ logic across all templates**
  - [x] Ensure the worker handles retry/backoff and DLQ storage for all email types
  - [x] Preserve invalid-email short-circuit handling

### Priority 2 — Maintainability & Doc Alignment

- [x] **Align provider identifier and optional template overrides**
  - [x] Rename provider id to `notification-resend` (or document why not)
  - [x] Add `html_templates` override support if needed for future customization

- [x] **Remove duplicate/unused flows**
  - [x] Deprecate unused workflow paths (e.g., `send-order-confirmation` if queue path is canonical)
  - [x] Centralize template mapping and typing

### Priority 3 — Observability

- [x] **Structured, minimal logging + metrics**
  - [x] Replace scattered `console.log` with logger where appropriate
  - [x] Emit `[METRIC] email_sent`, `[METRIC] email_failed`, `[METRIC] email_dlq` per template

## Dev Agent Record

### Debug Log
- 2026-01-20: Finalized remediation after adversarial review. 
- 2026-01-20: Refactored 3 subscribers to use direct queueing, removing workflow dependency.
- 2026-01-20: Improved Resend error mapping to enable status-based retry short-circuiting.
- 2026-01-20: Fixed logging across all email paths (worker + subscribers).

### Completion Notes
All issues identified in the adversarial review have been addressed. The backend email system now uses a unified, non-blocking path via BullMQ for all transactional templates. Error handling is robust, distinguishing between transient and permanent failures. PII is protected in logs, and Redis hygiene is maintained with job TTLs.

### Change Log
- Modified `ResendNotificationProviderService` to propagate error status codes.
- Refactored `customer-created.ts`, `fulfillment-created.ts`, `order-canceled.ts` to enqueue emails directly.
- Cleaned up `email-worker.ts` and `email-queue.ts` (logging, job cleanup).
- Deleted legacy workflows: `send-welcome-email`, `send-shipping-confirmation`, `send-order-canceled`.

## Acceptance Criteria
- [x] No raw PII in logs.
- [x] All email types are queued, retried, and routed to DLQ on repeated failure.
- [x] Provider config matches Medusa Resend guide requirements.
- [x] Non-blocking order flow remains intact for all email types.
- [x] Clear single-path architecture for sending emails.

## Risks & Notes

- Changes touch multiple subscribers/workflows; ensure tests cover each template.
- If test-mode behavior is required for local dev/CI, use explicit config flags to avoid accidental production disabling.
