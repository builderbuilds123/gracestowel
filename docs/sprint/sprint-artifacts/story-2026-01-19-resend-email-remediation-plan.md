# Story: Resend Email Remediation Plan (Medusa v2)

Date: 2026-01-19
Owner: Engineering
Status: Draft

## Objective
Bring the backend email system into alignment with Medusa Resend integration guidance and project email requirements. Address correctness, PII safety, delivery guarantees, and maintainability, while preserving non-blocking order flows.

## Scope
- Backend only (`apps/backend`)
- Notification/Resend provider, email queue/worker, and email-related subscribers/workflows
- No frontend changes

## References
- Medusa Resend guide: https://docs.medusajs.com/resources/integrations/guides/resend
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

## Plan (Prioritized)

### Priority 0 — Compliance & Correctness (Blockers)
1) **Remove PII from provider logs**
   - Stop logging raw recipient addresses and full payloads in `ResendNotificationProviderService`.
   - Use `maskEmail` and log only template + order/customer IDs.

2) **Fix provider option handling**
   - Ensure provider uses injected `options` instead of reading `process.env` at runtime for test mode.
   - Enforce required `api_key` and `from` in `validateOptions` per Medusa guide.
   - If test mode is desired, gate it explicitly via a dedicated option (never auto-infer from env in production).

### Priority 1 — Delivery Guarantees
3) **Standardize all email sending through the queue**
   - Expand `EmailJobPayload.template` to support all templates.
   - Modify welcome, shipping-confirmation, and order-canceled flows to enqueue instead of direct send.
   - Keep workflows for data assembly, but output should enqueue.

4) **Extend retry + DLQ logic across all templates**
   - Ensure the worker handles retry/backoff and DLQ storage for all email types.
   - Preserve invalid-email short-circuit handling.

### Priority 2 — Maintainability & Doc Alignment
5) **Align provider identifier and optional template overrides**
   - Rename provider id to `notification-resend` (or document why not).
   - Add `html_templates` override support if needed for future customization.

6) **Remove duplicate/unused flows**
   - Deprecate unused workflow paths (e.g., `send-order-confirmation` if queue path is canonical).
   - Centralize template mapping and typing.

### Priority 3 — Observability
7) **Structured, minimal logging + metrics**
   - Replace scattered `console.log` with logger where appropriate.
   - Emit `[METRIC] email_sent`, `[METRIC] email_failed`, `[METRIC] email_dlq` per template.

---

## Acceptance Criteria
- No raw PII (emails, addresses, order payloads) in logs.
- All email types are queued, retried, and routed to DLQ on repeated failure.
- Provider config matches Medusa Resend guide requirements.
- Non-blocking order flow remains intact for all email types.
- Clear single-path architecture for sending emails (no duplicate flows).

## Risks & Notes
- Changes touch multiple subscribers/workflows; ensure tests cover each template.
- If test-mode behavior is required for local dev/CI, use explicit config flags to avoid accidental production disabling.

