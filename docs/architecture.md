---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - "docs/prd.md"
  - "docs/project_context.md"
  - "docs/epics.md"
  - "docs/index.md"
  - "docs/architecture/overview.md"
  - "docs/architecture/backend.md"
  - "docs/architecture/data-models.md"
  - "docs/architecture/integration.md"
  - "docs/architecture/storefront.md"
workflowType: 'architecture'
lastStep: 3
project_name: 'gracestowel'
user_name: 'Big Dick'
date: '2025-12-14'
hasProjectContext: true
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (26 FRs):**
The PRD defines a transactional email system with clear separation of concerns:

1. **Email Delivery Core (FR1-5):** Resend API integration with async queue, retry mechanism (3x exponential backoff), and Dead Letter Queue for failed emails
2. **Order Confirmation (FR6-10):** Primary MVP feature — trigger on `order.placed` event, include order summary and magic link with 1-hour TTL
3. **Magic Link Integration (FR11-13):** Reuse existing GuestAccessService from Epic 4 — no new auth infrastructure needed
4. **Observability (FR14-18):** Structured logging of all email attempts, failure alerting, DLQ inspection via direct Redis access (MVP)
5. **Error Handling (FR19-23):** Graceful degradation — email failures never block order flows
6. **Configuration (FR24-26):** Environment variables for Resend credentials, feature flag for staged rollout

**Non-Functional Requirements (22 NFRs):**

| Category | Key Requirements |
|----------|------------------|
| Performance | Queue < 1s, API call < 30s, Total latency < 5 min |
| Security | API keys in env vars, no PII in logs, secure magic link tokens |
| Reliability | Non-blocking, 3x retry with backoff, DLQ persistence |
| Scalability | Handle 10x burst traffic, rate limiting, extensible design |
| Integration | Medusa subscribers, existing Redis, existing GuestAccessService |

**Scale & Complexity:**

- Primary domain: Backend API (Medusa v2 module extension)
- Complexity level: Low-Medium
- Estimated architectural components: 4-5 (Subscriber, EmailService, Queue Worker, Templates, DLQ)

### Technical Constraints & Dependencies

**From Project Context (30 rules):**
- ✅ Must use Medusa workflows with rollback logic
- ✅ Must use subscribers for domain events
- ✅ Must use BullMQ jobs for heavy processing (non-blocking)
- ✅ Redis already available for queue infrastructure
- ✅ MCP servers prioritized for external service interactions

**From PRD:**
- Resend as email provider (no alternatives considered for MVP)
- Reuse GuestAccessService for magic links (no new auth)
- Simple text templates for MVP (no rich HTML)
- Manual DLQ inspection only (no admin API for MVP)

### Cross-Cutting Concerns Identified

1. **Logging:** All email attempts must be logged with structured data (integrates with existing logging from Epic 8)
2. **Alerting:** Failure rate threshold triggers alerts (integrates with existing alerting infrastructure)
3. **Feature Flags:** Email system gated behind feature flag for staged rollout
4. **Error Handling:** Consistent retry/DLQ pattern for all transient failures
5. **Security:** PII handling in logs, secure token generation for magic links


## Starter Template Evaluation

### Primary Technology Domain

**Backend API Extension** — Adding transactional email capabilities to existing Medusa v2 e-commerce backend.

### Existing Technical Foundation (Brownfield)

This is not a greenfield project. The technical stack is already established and documented in `docs/project_context.md`:

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Node.js | >=24 |
| Backend Framework | Medusa | v2.12.0 |
| Database | PostgreSQL | Railway-hosted |
| Queue/Cache | Redis | BullMQ |
| Language | TypeScript | v5.6+ |
| Package Manager | pnpm | Monorepo workspaces |

### Starter Options Considered

**N/A — Brownfield Extension**

No starter template needed. We're extending an existing, well-architected system with:
- Established module patterns
- Existing subscriber infrastructure
- BullMQ already configured for async jobs
- Redis already available for queue/DLQ

### Selected Approach: Medusa Module Extension

**Rationale:**
- Project context mandates using Medusa workflows, subscribers, and BullMQ
- Email feature fits naturally as a Medusa module with subscriber triggers
- Existing infrastructure (Redis, logging, alerting) can be reused
- No new architectural patterns needed — follow established conventions

**Architectural Decisions Already Made by Existing Stack:**

| Decision | Established Pattern |
|----------|---------------------|
| Language & Runtime | TypeScript v5.6+, Node.js >=24 |
| Event Handling | Medusa subscribers for domain events |
| Async Processing | BullMQ jobs (non-blocking) |
| Queue Infrastructure | Redis (existing) |
| Logging | Structured logging (Epic 8) |
| Configuration | Environment variables |

**Note:** No project initialization needed — this is a feature addition to existing codebase.
