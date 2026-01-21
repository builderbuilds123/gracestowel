# Backend Analytics Migration Design

## Goal
Migrate all backend analytics to the Medusa Analytics Module, log all info-level logs to analytics, and remove direct PostHog SDK usage. Ensure PII is masked consistently and that staging + production both use PostHog while local dev uses the Local provider.

## Architecture
- Use Medusa Analytics Module (`Modules.ANALYTICS`) with one provider per environment.
- Provider selection remains environment-driven: dev uses `@medusajs/analytics-local`, staging/production use `@medusajs/analytics-posthog` (via `NODE_ENV=production` in Railway).
- Add a central analytics utility (`src/utils/analytics.ts`) that:
  - Resolves the analytics service from the Medusa container.
  - Normalizes event names to `domain.action`.
  - Applies PII masking to all properties.
  - Exposes `trackEvent`, `identifyActor`, and `trackLogEvent` helpers.
- Update the structured logger to mirror **all** info/warn/error logs into analytics via `trackLogEvent`, while preserving console output.

## Data Flow
- Logger: `logger.info(...)` emits JSON logs and triggers a `log.info` analytics event with sanitized properties.
- Explicit events: subscribers, workflows, jobs, and custom APIs call `trackEvent(...)` with curated payloads (IDs, counts, totals), not raw objects.
- Error handling: analytics failures must never break requests/jobs; tracking should swallow exceptions and avoid recursive logging loops.

## PII Masking
- Mask by key (`email`, `phone`, `first_name`, `last_name`, `address`, `token`, `authorization`, etc.).
- Regex mask for email/phone patterns in values.
- Preserve internal IDs (order_id, customer_id) for analytics grouping, but never include raw addresses, full names, or tokens.

## Testing
- Unit tests for masking/normalization and analytics utility behavior.
- Logger tests to verify info/warn/error map to analytics events.
- Representative tests for subscriber/job/API tracking calls.

## Validation
- Dev: Local provider emits events with `LOG_LEVEL=debug` as a system env var.
- Staging/Prod: PostHog receives `log.info` and business events; no PII leakage.
