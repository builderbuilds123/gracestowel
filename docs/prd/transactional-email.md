---
stepsCompleted: [1, 2, 3, 4, 7, 8, 9, 10, 11]
inputDocuments:
  - "docs/analysis/research/technical-stripe-integration-research-2025-12-06.md"
  - "docs/analysis/research/domain-supply-chain-optimization-research-2025-12-10.md"
  - "docs/analysis/brainstorming-session-2025-12-10.md"
  - "docs/analysis/brainstorming-session-review-2025-12-10.md"
  - "docs/analysis/strategic-supply-chain-master-plan-2025.md"
  - "docs/index.md"
documentCounts:
  briefs: 0
  research: 2
  brainstorming: 3
  projectDocs: 1
workflowType: 'prd'
lastStep: 11
project_name: 'gracestowel'
user_name: 'Big Dick'
date: '2025-12-14'
---

# Product Requirements Document - gracestowel

**Author:** Big Dick
**Date:** 2025-12-14

## Executive Summary

Grace Stowel currently has no mechanism to communicate order status to customers after checkout. This creates two critical gaps:

1. **Guest Recovery:** Guests who close their browser lose access to the 1-hour order modification window — a key feature of the payment integration that becomes unusable without email delivery of the magic link.

2. **Order Visibility:** Customers (both guests and registered) have no visibility into order lifecycle events (confirmation, modifications, shipping, capture).

This PRD defines a transactional email system using Resend that delivers timely, relevant order communications while establishing the programmatic email infrastructure needed for future marketing campaigns.

### What Makes This Special

This isn't just adding email notifications — it's **unlocking the full value of the existing grace period feature**. The 1-hour edit window (Epic 3-4 of Payment Integration) is only useful if guests can get back to their order. Email with magic link is the missing piece that makes that investment pay off.

**Key Principle:** Email delivery is non-blocking. Failed emails never break order flows — the system degrades gracefully while logging failures for retry or alerting.

## Project Classification

**Technical Type:** api_backend (Medusa integration) + web_app (email templates)
**Domain:** general (e-commerce)
**Complexity:** low-medium
**Project Context:** Brownfield — extending existing Medusa v2 + React Router v7 system

**Integration Points:**
- Medusa event system (order.placed, order.updated, order.shipped, etc.)
- Existing magic link infrastructure (GuestAccessService from Epic 4)
- Redis for async email job queue (non-blocking pattern)


## Success Criteria

### User Success

- **Guest Recovery:** Guests who close their browser can return to their order via the magic link in the confirmation email and complete modifications within the 1-hour window
- **Order Confidence:** Customers always know the current status of their order without needing to check the website or contact support
- **Timely Communication:** Emails arrive within 5 minutes of the triggering event (order placed, modified, shipped, etc.)

### Business Success

- **MVP (3 months):** Emails are reliably sent for all order confirmation events with magic links functioning correctly
- **Growth (6-12 months):** Click-through rate tracking on magic links — understand what actions users take (add items, cancel, update address) to inform product decisions
- **Foundation:** Programmatic email infrastructure established for future marketing campaigns

### Technical Success

- **Delivery:** Best-effort delivery with Resend — no hard delivery rate target for MVP
- **Observability:** All email attempts logged (success, failure, retry)
- **Alerting:** Failures trigger alerts for investigation
- **Resilience:** Retry mechanism for transient failures (network issues, rate limits)
- **Non-blocking:** Email failures never block order flows

### Measurable Outcomes

| Metric | MVP Target | Growth Target |
|--------|------------|---------------|
| Email latency | < 5 minutes | < 1 minute |
| Delivery rate | Best effort | > 98% |
| Magic link click-through | Not tracked | Tracked via PostHog |
| System uptime | Logged failures | < 1% failure rate |

## Product Scope

### MVP - Minimum Viable Product

**Must ship:**
- Resend integration and configuration
- Order Confirmation email with magic link
- Async email queue (non-blocking)
- Logging of all email attempts
- Basic retry mechanism
- Failure alerting

**Email template:** Simple text-based (no rich HTML)

### Growth Features (Post-MVP)

- Order Modified email
- Shipping Address Updated email
- Payment Captured email (grace period ended)
- Order Cancelled email
- Order Shipped email
- Click-through tracking via PostHog integration
- Rich HTML email templates (branded)

### Vision (Future)

- Marketing campaign emails
- Abandoned cart recovery
- Re-engagement campaigns
- Email preference management
- Unsubscribe handling


## User Journeys

### Journey 1: Sarah — Guest Recovery via Magic Link (Primary User - Success Path)

Sarah just ordered custom embroidered towels as a wedding gift. She's excited, completes checkout as a guest (no account), sees the confirmation page with the "1 hour to modify" message, and then... her toddler needs attention. She closes the laptop.

20 minutes later, she realizes she ordered the wrong quantity — she needs 6 towels, not 4. She panics. Did she save that confirmation page? No. Does she have an account? No.

Then she checks her email. There it is — the order confirmation from Grace Stowel with a big "Modify Your Order" button. She clicks it, lands on her order page, adds 2 more towels, and breathes a sigh of relief. The wedding gift is saved.

**Journey Requirements:**
- Email delivery within 5 minutes of order placement
- Magic link prominently displayed in email
- Link valid for full 1-hour grace period
- Order summary included so customer can verify correct order
- Clear call-to-action for modification

### Journey 2: Dave — Ops Monitoring Email Health (Admin/Operations)

Dave is the developer/ops person responsible for Grace Stowel. It's Monday morning and he wants to check if the email system is healthy.

He opens the logs and sees a clean stream of email events: `email.sent`, `email.sent`, `email.sent`. Good. Then he notices one `email.failed` with a Resend rate limit error from Saturday night during a flash sale. The system automatically retried 3 times, and the 3rd attempt succeeded. The customer got their email.

Later that week, Resend has a 2-hour outage. Dave gets an alert: "Email failure rate > 5% in last 15 minutes." He checks the logs, sees it's a Resend issue. After 3 retries, 47 emails land in the Dead Letter Queue (DLQ). Orders all completed fine — just without email confirmation.

Once Resend is back online, Dave opens the DLQ, reviews the failed emails (all order confirmations from the outage window), and triggers a bulk retry. Within minutes, all 47 customers receive their confirmation emails. One email has an invalid address — Dave marks it as "undeliverable" and moves on.

**Journey Requirements:**
- Structured logging of all email attempts (success, failure, retry)
- Alerting when failure rate exceeds threshold
- Automatic retry with exponential backoff (3 attempts)
- Dead Letter Queue (DLQ) for emails that fail all retries
- Manual inspection of DLQ entries
- Manual retry/bulk retry from DLQ
- Ability to mark DLQ entries as "undeliverable" or "resolved"
- Non-blocking architecture (orders never fail due to email)

### Journey Requirements Summary

| Capability | Source Journey | Priority |
|------------|----------------|----------|
| Email delivery < 5 min | Sarah (Guest Recovery) | MVP |
| Magic link in email | Sarah (Guest Recovery) | MVP |
| Order summary in email | Sarah (Guest Recovery) | MVP |
| Structured logging | Dave (Ops Monitoring) | MVP |
| Failure alerting | Dave (Ops Monitoring) | MVP |
| Retry mechanism (3 attempts) | Dave (Ops Monitoring) | MVP |
| Dead Letter Queue (DLQ) | Dave (Ops Monitoring) | MVP |
| Manual DLQ inspection | Dave (Ops Monitoring) | MVP |
| Manual retry from DLQ | Dave (Ops Monitoring) | MVP |
| Non-blocking delivery | Dave (Ops Monitoring) | MVP |


## API Backend Specific Requirements

### Project-Type Overview

This is a backend integration feature that adds transactional email capabilities to the existing Medusa v2 e-commerce backend. No new public API endpoints are required — emails are triggered internally via Medusa's subscriber/event system.

### Technical Architecture Considerations

**Event-Driven Architecture:**
- Leverage Medusa's built-in subscriber system for email triggers
- Subscribe to existing events: `order.placed`, `order.updated`, `order.shipped`, etc.
- Non-blocking: Email sending runs asynchronously, never blocks the event flow

**Email Provider Integration:**
- Provider: Resend
- Authentication: API key stored in environment variables (`RESEND_API_KEY`)
- No SDK wrapper needed for MVP — direct Resend API calls

### Event Triggers & Email Mapping

| Medusa Event | Email Type | MVP | Priority |
|--------------|------------|-----|----------|
| `order.placed` | Order Confirmation (with magic link) | ✅ | P0 |
| `order.updated` | Order Modified | ❌ | P1 |
| `order.shipped` | Order Shipped | ❌ | P1 |
| `order.canceled` | Order Cancelled | ❌ | P1 |
| Custom: `payment.captured` | Payment Captured | ❌ | P1 |
| Custom: `shipping_address.updated` | Address Updated | ❌ | P2 |

### Queue & Retry Architecture

**Async Email Queue:**
- Use Redis (existing infrastructure) for email job queue
- Jobs processed asynchronously to ensure non-blocking behavior
- Retry mechanism: 3 attempts with exponential backoff

**Dead Letter Queue (DLQ):**
- Failed emails (after 3 retries) stored in DLQ
- MVP: Manual inspection via direct database/Redis access
- Post-MVP: Admin API for DLQ management (when marketing campaigns are built)

### Data Schemas

**Email Job Payload:**
```
{
  id: string (uuid)
  type: "order_confirmation" | "order_modified" | ...
  recipient: string (email)
  orderId: string
  customerId: string | null
  payload: {
    orderSummary: {...}
    magicLink: string (for order_confirmation)
    ...
  }
  attempts: number
  lastError: string | null
  createdAt: timestamp
  status: "pending" | "sent" | "failed" | "dlq"
}
```

### Error Handling

| Error Type | Handling | Retry? |
|------------|----------|--------|
| Resend rate limit | Exponential backoff | Yes (3x) |
| Resend API error (5xx) | Log + retry | Yes (3x) |
| Invalid email address | Log + DLQ | No |
| Network timeout | Retry with backoff | Yes (3x) |
| All retries exhausted | Move to DLQ + alert | N/A |

### Integration Points

- **Medusa Event System:** Subscribe to order lifecycle events
- **Existing Magic Link Service:** Reuse `GuestAccessService` from Epic 4 to generate magic links
- **Redis:** Existing infrastructure for async job queue and DLQ
- **Logging:** Integrate with existing structured logging (from Epic 8)
- **Alerting:** Integrate with existing alerting infrastructure

### Implementation Considerations

- **No new public endpoints** for MVP — all internal
- **Environment variables:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- **Feature flag:** Consider gating behind feature flag for staged rollout
- **Testing:** Mock Resend API in test environment


## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-Solving MVP — Solve the core guest recovery problem with minimal features
**Implementation:** AI agent-assisted development
**Timeline:** No hard deadline — quality over speed
**Team:** Solo/AI-assisted

### MVP Feature Set (Phase 1)

**Core User Journey Supported:**
- Guest Recovery via Magic Link (Sarah's journey)

**Must-Have Capabilities:**

| Feature | Rationale |
|---------|-----------|
| Resend integration | Email provider setup |
| Order Confirmation email | Core user value — guest recovery |
| Magic link in email | Enables 1-hour edit window access |
| Async email queue | Non-blocking architecture |
| Retry mechanism (3x) | Resilience for transient failures |
| DLQ storage | Capture failed emails for later inspection |
| Structured logging | Observability for debugging |
| Failure alerting | Know when things break |

**Explicitly NOT in MVP:**
- Other email types (modified, shipped, cancelled, captured)
- Admin API for DLQ management
- Rich HTML templates
- Click-through tracking
- Bulk retry from DLQ (manual Redis access only)

### Post-MVP Features (Phase 2)

| Feature | Priority | Dependency |
|---------|----------|------------|
| Order Modified email | P1 | MVP complete |
| Order Shipped email | P1 | MVP complete |
| Order Cancelled email | P1 | MVP complete |
| Payment Captured email | P1 | MVP complete |
| Shipping Address Updated email | P2 | MVP complete |
| Click-through tracking (PostHog) | P2 | MVP complete |
| Rich HTML templates | P2 | MVP complete |

### Expansion Features (Phase 3)

| Feature | Priority | Dependency |
|---------|----------|------------|
| Admin API for DLQ management | P3 | Phase 2 complete |
| Marketing campaign emails | P3 | Admin API |
| Abandoned cart recovery | P3 | Marketing infrastructure |
| Email preference management | P3 | Marketing infrastructure |
| Unsubscribe handling | P3 | Marketing infrastructure |

### Risk Mitigation Strategy

**Primary Risk:** Getting the implementation wrong (AI agent implementation)

**Mitigation Approach:**
1. **Detailed Acceptance Criteria:** Each story includes explicit, testable criteria
2. **Test Cases:** Define expected behavior for success, failure, and edge cases
3. **Feature Flag:** Gate behind feature flag for staged rollout
4. **Logging First:** Ensure comprehensive logging before going live
5. **Manual Testing:** Verify emails actually arrive in inbox (not just "sent")
6. **Rollback Plan:** Feature flag allows instant disable if issues arise

**Secondary Risks:**

| Risk | Mitigation |
|------|------------|
| Resend API changes | Pin API version, monitor changelog |
| Rate limiting during flash sales | Exponential backoff, queue smoothing |
| Invalid email addresses | Validate format, handle bounces gracefully |
| Magic link expiration mismatch | Sync TTL with grace period (1 hour) |


## Functional Requirements

### Email Delivery

- **FR1:** System can send transactional emails via Resend API
- **FR2:** System can queue email jobs asynchronously (non-blocking to order flow)
- **FR3:** System can retry failed email deliveries up to 3 times with exponential backoff
- **FR4:** System can move emails to Dead Letter Queue after all retries are exhausted
- **FR5:** System can store email job metadata (recipient, type, status, attempts, errors)

### Order Confirmation Email

- **FR6:** System can trigger Order Confirmation email when `order.placed` event fires
- **FR7:** System can include order summary in Order Confirmation email (items, quantities, totals)
- **FR8:** System can include magic link in Order Confirmation email for guest order access
- **FR9:** System can generate magic link with 1-hour TTL matching grace period
- **FR10:** Customer can receive Order Confirmation email at the email address provided during checkout

### Magic Link Integration

- **FR11:** System can reuse existing GuestAccessService to generate magic links
- **FR12:** Magic link in email can authenticate guest to view/modify their specific order
- **FR13:** Magic link in email can remain valid for the full 1-hour grace period

### Observability & Monitoring

- **FR14:** System can log all email send attempts with structured data (success, failure, retry)
- **FR15:** System can log email job metadata (id, type, recipient, orderId, status, timestamp)
- **FR16:** System can trigger alerts when email failure rate exceeds threshold
- **FR17:** Operator can view email delivery logs to diagnose issues
- **FR18:** Operator can view Dead Letter Queue entries via direct database/Redis access

### Error Handling & Resilience

- **FR19:** System can handle Resend API rate limits gracefully (backoff and retry)
- **FR20:** System can handle Resend API errors (5xx) with retry
- **FR21:** System can handle invalid email addresses by logging and moving to DLQ (no retry)
- **FR22:** System can handle network timeouts with retry
- **FR23:** System can continue processing orders even when email delivery fails

### Configuration

- **FR24:** System can be configured with Resend API credentials via environment variables
- **FR25:** System can be configured with sender email address via environment variables
- **FR26:** System can be enabled/disabled via feature flag for staged rollout


## Non-Functional Requirements

### Performance

- **NFR1:** Email jobs must be queued within 1 second of triggering event
- **NFR2:** Email delivery to Resend API must complete within 30 seconds per attempt
- **NFR3:** Total email latency (event → inbox) must be < 5 minutes under normal conditions
- **NFR4:** Queue processing must not block Medusa event handlers

### Security

- **NFR5:** Resend API key must be stored in environment variables, never in code
- **NFR6:** Email addresses must not be logged in plain text in production logs
- **NFR7:** Magic links must use cryptographically secure tokens (existing GuestAccessService)
- **NFR8:** Magic links must expire after 1 hour (matching grace period)
- **NFR9:** DLQ entries containing email addresses must be access-controlled

### Reliability

- **NFR10:** Email failures must never block or fail order processing
- **NFR11:** System must retry transient failures with exponential backoff (3 attempts)
- **NFR12:** System must gracefully degrade when Resend is unavailable (queue + DLQ)
- **NFR13:** System must recover automatically when Resend becomes available
- **NFR14:** DLQ must persist failed emails until manually resolved

### Scalability

- **NFR15:** Queue must handle burst traffic during flash sales (10x normal volume)
- **NFR16:** Queue processing must be rate-limited to avoid Resend API limits
- **NFR17:** System must support adding new email types without architectural changes

### Integration

- **NFR18:** System must integrate with Medusa's built-in subscriber/event system
- **NFR19:** System must reuse existing Redis infrastructure for queue and DLQ
- **NFR20:** System must reuse existing GuestAccessService for magic link generation
- **NFR21:** System must integrate with existing structured logging infrastructure
- **NFR22:** System must integrate with existing alerting infrastructure
