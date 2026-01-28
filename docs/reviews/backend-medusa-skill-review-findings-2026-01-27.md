# Backend Medusa Implementation Review — Findings Report

**Date:** 2026-01-27  
**Basis:** [building-with-medusa](.agents/skills/building-with-medusa/SKILL.md) skill and reference files (`custom-modules`, `api-routes`, `workflows`, `module-links`, `error-handling`).  
**Scope:** Custom modules, workflows, API routes, middleware, links, subscribers, and `medusa-config`.

---

## 1. Architecture

### 1.1 Routes that perform mutations without running a workflow

| File | Handler | Issue | Suggested change |
|------|---------|--------|------------------|
| [`apps/backend/src/api/admin/reviews/[id]/route.ts`](apps/backend/src/api/admin/reviews/[id]/route.ts) | `POST` | Calls `reviewService.updateReviews({ id, ...updates })` directly | Introduce or reuse an update-review workflow; route should only `run` the workflow and return its result. |
| [`apps/backend/src/api/admin/reviews/[id]/route.ts`](apps/backend/src/api/admin/reviews/[id]/route.ts) | `DELETE` | Calls `reviewService.deleteReviews(id)` directly | Add a delete-review workflow (or extend update-review); route should execute workflow only. |
| [`apps/backend/src/api/admin/reviews/batch/route.ts`](apps/backend/src/api/admin/reviews/batch/route.ts) | `POST` (when `action === "delete"`) | Calls `reviewService.deleteReviews(ids)` directly | Use the same delete-review workflow (or batch variant); remove direct service delete. |
| [`apps/backend/src/api/store/reviews/[reviewId]/helpful/route.ts`](apps/backend/src/api/store/reviews/[reviewId]/helpful/route.ts) | `POST` | Calls `reviewService.recordHelpfulVote` and `reviewService.incrementHelpfulCount` directly | Add a “record helpful vote” workflow; steps: create vote, increment count. Route runs workflow only. |

**Skill rules:** `arch-workflow-required`, `arch-layer-bypass` — all mutations must go through workflows; no route → service bypass for creates/updates/deletes.

### 1.2 Use of PUT / PATCH

| Location | Issue | Recommendation |
|----------|--------|-----------------|
| [`apps/backend/src/api/middlewares.ts`](apps/backend/src/api/middlewares.ts) | `method: ["POST", "PUT"]` for `/admin/reviews/:id/response` | Medusa convention: use only GET, POST, DELETE. Map “update response” to POST (e.g. POST to create/update) or a dedicated POST route; remove PUT. |
| [`apps/backend/src/api/admin/reviews/[id]/response/route.ts`](apps/backend/src/api/admin/reviews/[id]/response/route.ts) | `PUT` handler for updating admin response | Replace with POST-only semantics (e.g. “upsert” via POST) or consolidate into a single POST handler; delete PUT. |

**Skill rule:** `arch-http-methods` — only GET, POST, DELETE.

---

## 2. Type safety

### 2.1 Use of `MedusaRequest` instead of `AuthenticatedMedusaRequest`

| File | Handler | Note |
|------|---------|------|
| [`apps/backend/src/api/store/products/[id]/reviews/route.ts`](apps/backend/src/api/store/products/[id]/reviews/route.ts) | `POST` | Uses `(req as any).auth_context?.actor_id`. Route is customer-protected (or should be). Use `AuthenticatedMedusaRequest` and ensure route is behind `authenticate("customer", ...)`; then use `req.auth_context.actor_id` without `as any`. |
| [`apps/backend/src/api/store/reviews/[reviewId]/helpful/route.ts`](apps/backend/src/api/store/reviews/[reviewId]/helpful/route.ts) | `POST`, `GET` | Same pattern: `(req as any).auth_context?.actor_id`. Use `AuthenticatedMedusaRequest` for protected paths and drop `as any`. |

**Skill rule:** `type-authenticated-request` — use `AuthenticatedMedusaRequest` for protected routes.

### 2.2 `as any` and missing `MedusaRequest<SchemaType>`

| Location | Issue | Fix |
|----------|--------|-----|
| [`apps/backend/src/api/middlewares.ts`](apps/backend/src/api/middlewares.ts) | `validateAndTransformBody(PostAdminReviewResponseSchema as any)` | Remove `as any`. Use the schema as-is; ensure Zod types are compatible with the middleware. |
| [`apps/backend/src/api/admin/reviews/[id]/response/route.ts`](apps/backend/src/api/admin/reviews/[id]/response/route.ts) | `req.validatedBody as { content: string }`; no `MedusaRequest<T>` | Export inferred type from schema (e.g. `z.infer<typeof PostAdminReviewResponseSchema>`) and use `MedusaRequest<CreateAdminReviewResponseSchema>`. Use `req.validatedBody` without casting. |
| [`apps/backend/src/api/store/orders/by-payment-intent/route.ts`](apps/backend/src/api/store/orders/by-payment-intent/route.ts) | `req.scope.resolve("payment") as any` and `payment.data as any` | Resolve payment module with a proper type (e.g. from `@medusajs/medusa` or local types). Type `data` from the payment shape instead of `as any`. |
| [`apps/backend/src/modules/stripePartialCapture/index.ts`](apps/backend/src/modules/stripePartialCapture/index.ts) | `StripePartialCaptureService as any` in ModuleProvider | Comment references protected constructor. Prefer a typed workaround (adapter type or module-provider typing) if available; otherwise document why `as any` is required and keep it minimal. |

**Skill rules:** `type-request-schema`, `type-export-schema` — type `req.validatedBody` via `MedusaRequest<T>`; avoid `any`.

---

## 3. Business logic placement

### 3.1 Validation or ownership checks in routes instead of workflows

| File | What’s in the route | Recommendation |
|------|----------------------|----------------|
| [`apps/backend/src/api/store/products/[id]/reviews/route.ts`](apps/backend/src/api/store/products/[id]/reviews/route.ts) | `POST`: auth check, rating/title/content validation, duplicate review check (`hasCustomerReviewed`), purchase verification (query orders + match product), `getAutoApprovalStatus`, then `createReviewWorkflow` | Move validation, duplicate check, purchase verification, and approval logic into workflow steps. Route: validate body via middleware (Zod), pass `customer_id` from auth; run `createReviewWorkflow` only. |
| [`apps/backend/src/api/store/reviews/[reviewId]/helpful/route.ts`](apps/backend/src/api/store/reviews/[reviewId]/helpful/route.ts) | `POST`: “review exists”, “approved only”, “already voted” checks, then `recordHelpfulVote` + `incrementHelpfulCount` | Move “review exists”, “approved”, “already voted” checks into a “record helpful vote” workflow step. Route runs workflow only. |

**Skill rules:** `logic-workflow-validation`, `logic-ownership-checks` — validation and ownership/permission checks belong in workflow steps, not in routes.

### 3.2 Module service holding more than CRUD

| Location | Issue | Recommendation |
|----------|--------|-----------------|
| [`apps/backend/src/modules/review/service.ts`](apps/backend/src/modules/review/service.ts) | `getProductReviews`, `getProductRatingStats`, `hasCustomerReviewed`, `getAutoApprovalStatus`, `hasVoted`, `recordHelpfulVote`, `incrementHelpfulCount` | Skill recommends modules stay CRUD-focused. Consider moving aggregation, approval, and vote logic into workflows or dedicated domain services; keep review module mostly as data access. |

**Skill rule:** `logic-module-service` — keep modules simple (CRUD); put logic in workflows.

### 3.3 Logging

| Location | Issue | Fix |
|----------|--------|-----|
| [`apps/backend/src/api/admin/reviews/batch/route.ts`](apps/backend/src/api/admin/reviews/batch/route.ts) | `console.error("Batch operation error:", error)` in catch | Use structured logger (e.g. `logger.error(...)`) per project rules; avoid `console.error`. |

---

## 4. Workflow composition

### 4.1 Arrow functions instead of `function (input) { }`

All workflows use arrow functions for the composition callback, e.g. `(input: X) => { ... }`. The skill requires a regular synchronous `function` declaration.

| Files |
|-------|
| [`create-review.ts`](apps/backend/src/workflows/create-review.ts), [`update-review.ts`](apps/backend/src/workflows/update-review.ts), [`send-order-confirmation.ts`](apps/backend/src/workflows/send-order-confirmation.ts), [`create-order-from-stripe.ts`](apps/backend/src/workflows/create-order-from-stripe.ts), [`cancel-order-with-refund.ts`](apps/backend/src/workflows/cancel-order-with-refund.ts), [`batch-modify-order.ts`](apps/backend/src/workflows/batch-modify-order.ts), [`update-line-item-quantity.ts`](apps/backend/src/workflows/update-line-item-quantity.ts), [`add-item-to-order.ts`](apps/backend/src/workflows/add-item-to-order.ts), [`supplementary-charge.ts`](apps/backend/src/workflows/supplementary-charge.ts) |

**Change:** Use `function (input: X) { ... }` instead of `(input: X) => { ... }`.

### 4.2 Step return shape and compensation input

| File | Issue | Recommendation |
|------|--------|-----------------|
| [`apps/backend/src/workflows/steps/create-review.ts`](apps/backend/src/workflows/steps/create-review.ts) | `createReviews(input)` returns an array in Medusa’s default service; step uses `review` and `review.id` as if it were a single object. Compensation uses `reviewId`. | Ensure step handles array return (e.g. `const [review] = await ...` or `review = (await ...)[0]`). Use `review.id` for `StepResponse` and compensation so rollback is correct. |

### 4.3 Other workflow patterns

- **create-review:** Uses `useQueryGraphStep` to verify product exists; no `createRemoteLinkStep`. Review model stores `product_id` / `customer_id` as columns; there are no review–product or review–customer links. Consistent with current design; link-based model would be an optional future improvement.
- **update-review:** Step has compensation (restore original data). Good.
- **send-order-confirmation:** Uses `when` and `transform`; built-in `useRemoteQueryStep` and custom `sendNotificationStep`. Appropriate.

---

## 5. Data access and links

### 5.1 `query.graph()` vs direct service calls

- **Reads:** Many routes use `query.graph()` for cross-entity reads (e.g. order, customer, order items). Good.
- **List endpoints:** Admin reviews list, store product reviews, etc. use `listAndCountReviews` or `getProductReviews` with raw `req.query` (limit, offset, status, etc.). No `createFindParams` or `req.queryConfig`.

**Recommendation:** For list APIs that should support client-controlled fields, pagination, and ordering, consider `validateAndTransformQuery` with `createFindParams` and `req.queryConfig` as in the skill’s “List with Query Config” pattern. Optional improvement.

### 5.2 Links

- **Defined:** [`apps/backend/src/links/reservation-line-item.ts`](apps/backend/src/links/reservation-line-item.ts) — one link per file, `defineLink` between `reservationItem` and `orderLineItem`. Correct.
- **Review–product / review–customer:** Not defined. Reviews use `product_id` and `customer_id` on the model. Adding links would allow `query.graph()` over relationships (e.g. `product.reviews`) and align with “extend commerce entities” guidance; optional.

---

## 6. Middleware and validation

- **Stripe webhook:** `bodyParser: false` for `/webhooks/stripe`. Correct.
- **Admin:** `authenticate("user", ["session", "bearer", "api-key"])` on `/admin/*`. Good.
- **Review response:** Only route-specific validation middleware found. Uses `validateAndTransformBody(PostAdminReviewResponseSchema as any)` for `/admin/reviews/:id/response` with `method: ["POST", "PUT"]`.
  - Fix `as any` and PUT usage as in sections 1.2 and 2.2.
- **Store review create:** No `validateAndTransformBody` for `POST /store/products/:id/reviews`. Validation is done inline. Prefer Zod schema + middleware and typed `req.validatedBody`.

---

## 7. Subscribers and config

### 7.1 Subscribers

- **order.placed, order.canceled, customer.created, customer.password_reset, inventory.backordered:** Use `SubscriberArgs`, `SubscriberConfig`, and `container`. They use `query.graph` where needed and enqueue email via BullMQ. Pattern matches the skill.
- **Minor:** `order-canceled` uses `catch (error: any)`; prefer a typed error or `unknown` and narrow.

### 7.2 `medusa-config`

- **Review module:** `resolve: "./src/modules/review"` registered.
- **Resend:** `resolve: "./src/modules/resend"` as notification provider.
- **Stripe partial capture:** `resolve: "./src/modules/stripePartialCapture"` as payment provider.
- No duplicate or conflicting module entries.

---

## 8. Positives

- **Review module:** `Module("review", { service })`, camelCase key; service extends `MedusaService({ Review, ReviewHelpfulVote })`; models use `model.define` without `.linkable()`. Exported correctly.
- **Workflows for many mutations:** Create review (store), update review (admin response, batch approve/reject), cancel order, create order from Stripe, batch modify order, add item, update line item, supplementary charge — all use workflows.
- **Built-in steps:** `useQueryGraphStep` (create-review), `useRemoteQueryStep` (send-order-confirmation), core-flows steps in cancel/create-order/batch-modify, etc.
- **Links:** `reservation-line-item` link correctly defined; one link per file.
- **Order flows:** Cancel and batch-modifications routes call workflows; no direct order/item mutations in those routes.
- **Structured logging:** Project uses `logger` from `utils/logger` in many places; avoid `console.log` in new code.
- **MedusaError:** Used in workflows and utils for consistent error handling.

---

## 9. Summary of recommended fixes (priority)

| Priority | Category | Action |
|----------|----------|--------|
| P0 | Architecture | Move admin review single update/delete and batch delete to workflows; add “record helpful vote” workflow; remove direct review service mutations from routes. |
| P0 | Architecture | Remove PUT for admin review response; use POST only. |
| P1 | Type safety | Replace `as any` in middlewares and routes; use `AuthenticatedMedusaRequest` and `MedusaRequest<T>` for validated body; type payment resolution and payment data. |
| P1 | Business logic | Move store review create validation, duplicate check, and purchase verification into workflow steps; move helpful-vote checks into workflow. |
| P2 | Workflows | Switch workflow composition to `function (input) { }`; fix create-review step return shape. |
| P2 | Middleware | Add Zod + `validateAndTransformBody` for store review create; export schema types. |
| P2 | Logging | Replace `console.error` in admin reviews batch route with structured logger. |
| P3 | Data | Optionally add `createFindParams` + `req.queryConfig` for list routes; optionally add review–product / review–customer links. |

---

## Remediation update (3.4 + Phase 4)

**Implemented (2026-01-27):**

- **3.4 / P3 list routes:** `createFindParams` + `req.queryConfig` added for:
  - **GET /admin/reviews:** `GetAdminReviewsSchema`, `validateAndTransformQuery(GetAdminReviewsSchema, { isList: true, defaultLimit: 20, defaults: [...] })`; route uses `req.queryConfig.pagination` (take, skip, order) and `req.filterableFields` (status, product_id).
  - **GET /store/products/:id/reviews:** `GetStoreProductReviewsSchema`, `validateAndTransformQuery(GetStoreProductReviewsSchema, { isList: true, defaultLimit: 10, defaults: [...] })`; route uses `req.queryConfig.pagination` and supports both `order` (from query config) and legacy `sort` (newest/oldest/highest/lowest/helpful).
- Schemas are Zod-based (limit, offset, order, fields + admin: status/product_id, store: sort). Middleware uses `as any` for schema type compatibility with framework Zod typing.

**Deferred (optional):**

- **Review–product / review–customer links:** Not implemented. Adding them would require the review module to expose `linkable` and new link files; the current module uses `Module(REVIEW_MODULE, { service })` and does not expose linkable. Left as a future improvement.

---

*Review performed per [Backend Medusa Review Plan](.cursor/plans/backend_medusa_review_0405631a.plan.md). No code changes were made.*
