# Backend Analytics Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all backend analytics to Medusa Analytics Module, mirror all info logs to analytics, and remove posthog-node usage while masking PII.

**Architecture:** Central analytics utility + logger adapter. Explicit business events tracked in subscribers, workflows, jobs, and APIs. Provider selection via `NODE_ENV` (Local in dev, PostHog in staging/production).

**Tech Stack:** Medusa v2.12.x Analytics Module, TypeScript, Vitest.

---

### Task 1: Add analytics utility with PII masking

**Files:**
- Create: `apps/backend/src/utils/analytics.ts`
- Test: `apps/backend/integration-tests/unit/analytics-utils.unit.spec.ts`

**Step 1: Write the failing test**
```ts
import { describe, expect, it } from "vitest";
import { maskProperties, normalizeEventName } from "../../src/utils/analytics";

describe("analytics utils", () => {
  it("masks email/phone-like values and sensitive keys", () => {
    const input = { email: "a@b.com", token: "secret", message: "call 555-123-4567" };
    const masked = maskProperties(input);
    expect(masked.email).not.toBe("a@b.com");
    expect(masked.token).not.toBe("secret");
    expect(masked.message).not.toContain("555-123-4567");
  });

  it("normalizes events to domain.action", () => {
    expect(normalizeEventName("order_placed")).toBe("order.placed");
  });
});
```

**Step 2: Run test to verify it fails**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/analytics-utils.unit.spec.ts`
Expected: FAIL (module not found / functions missing)

**Step 3: Write minimal implementation**
```ts
// apps/backend/src/utils/analytics.ts
import type { AnalyticsService } from "./analytics"; // or define local interface
export const normalizeEventName = (event: string) => event.replace(/_/g, ".");
export const maskProperties = (input: Record<string, unknown>) => ({ /* masked result */ });
```

**Step 4: Run test to verify it passes**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/analytics-utils.unit.spec.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/backend/src/utils/analytics.ts apps/backend/integration-tests/unit/analytics-utils.unit.spec.ts
git commit -m "feat(analytics): add masking and event normalization utilities"
```

---

### Task 2: Wire logger to analytics via adapter + loader

**Files:**
- Modify: `apps/backend/src/utils/logger.ts`
- Create: `apps/backend/src/loaders/analytics-logger.ts`
- Modify: `apps/backend/src/loaders/index.ts`
- Test: `apps/backend/integration-tests/unit/logger-analytics.unit.spec.ts`

**Step 1: Write the failing test**
```ts
import { describe, it, expect, vi } from "vitest";
import { setAnalyticsServiceForLogger, logger } from "../../src/utils/logger";

describe("logger analytics adapter", () => {
  it("sends info logs to analytics", () => {
    const track = vi.fn();
    setAnalyticsServiceForLogger({ track } as any);
    logger.info("test", "hello", { order_id: "o_1" });
    expect(track).toHaveBeenCalledWith(expect.objectContaining({ event: "log.info" }));
  });
});
```

**Step 2: Run test to verify it fails**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/logger-analytics.unit.spec.ts`
Expected: FAIL (setter not implemented)

**Step 3: Write minimal implementation**
```ts
// apps/backend/src/utils/logger.ts
let analyticsService: { track: (data: any) => Promise<void> } | null = null;
export const setAnalyticsServiceForLogger = (service: typeof analyticsService) => { analyticsService = service; };
// In info/warn/error: call analyticsService?.track({ event: "log.info", properties: maskedProps })
```
```ts
// apps/backend/src/loaders/analytics-logger.ts
import { Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { setAnalyticsServiceForLogger } from "../utils/logger";

export default async function analyticsLoggerLoader(container: MedusaContainer) {
  const analytics = container.resolve(Modules.ANALYTICS);
  setAnalyticsServiceForLogger(analytics);
}
```

**Step 4: Run test to verify it passes**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/logger-analytics.unit.spec.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/backend/src/utils/logger.ts apps/backend/src/loaders/analytics-logger.ts apps/backend/src/loaders/index.ts apps/backend/integration-tests/unit/logger-analytics.unit.spec.ts
git commit -m "feat(analytics): mirror logs to analytics via logger adapter"
```

---

### Task 3: Replace PostHog in API error middleware + health route

**Files:**
- Modify: `apps/backend/src/api/middlewares.ts`
- Modify: `apps/backend/src/api/health/route.ts`
- Test: `apps/backend/integration-tests/unit/middlewares-error-analytics.unit.spec.ts`
- Test: `apps/backend/integration-tests/unit/health-analytics.unit.spec.ts`

**Step 1: Write the failing tests**
```ts
// middlewares-error-analytics.unit.spec.ts
import { describe, it, expect, vi } from "vitest";
import { trackEvent } from "../../src/utils/analytics";
vi.mock("../../src/utils/analytics", () => ({ trackEvent: vi.fn() }));
// invoke errorHandlerMiddleware and assert trackEvent called with event "backend.error"
```
```ts
// health-analytics.unit.spec.ts
import { describe, it, expect, vi } from "vitest";
import { trackEvent } from "../../src/utils/analytics";
vi.mock("../../src/utils/analytics", () => ({ trackEvent: vi.fn() }));
// call GET with mocked req/res and assert trackEvent event "system.health_check"
```

**Step 2: Run tests to verify they fail**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/middlewares-error-analytics.unit.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**
```ts
// apps/backend/src/api/middlewares.ts
import { trackEvent } from "../utils/analytics";
// replace captureBackendError(...) with trackEvent(container, "backend.error", { path, method })
```
```ts
// apps/backend/src/api/health/route.ts
import { trackEvent } from "../../utils/analytics";
// replace posthog.capture with trackEvent(req.scope, "system.health_check", {...})
```

**Step 4: Run tests to verify they pass**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/middlewares-error-analytics.unit.spec.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/backend/src/api/middlewares.ts apps/backend/src/api/health/route.ts apps/backend/integration-tests/unit/middlewares-error-analytics.unit.spec.ts apps/backend/integration-tests/unit/health-analytics.unit.spec.ts
git commit -m "feat(analytics): track backend errors and health checks"
```

---

### Task 4: Migrate order placed + fallback capture analytics

**Files:**
- Modify: `apps/backend/src/subscribers/order-placed.ts`
- Modify: `apps/backend/src/jobs/fallback-capture.ts`
- Test: `apps/backend/integration-tests/unit/order-placed-analytics.unit.spec.ts`
- Test: `apps/backend/integration-tests/unit/fallback-capture-analytics.unit.spec.ts`

**Step 1: Write the failing tests**
```ts
// order-placed-analytics.unit.spec.ts
// call handler with mocked container + analytics and assert event "order.placed"
```
```ts
// fallback-capture-analytics.unit.spec.ts
// call job with mocked analytics and assert events "recovery.redis_triggered" and "capture.fallback.triggered"
```

**Step 2: Run tests to verify they fail**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/order-placed-analytics.unit.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**
```ts
// order-placed.ts
import { trackEvent } from "../utils/analytics";
// replace posthog.capture with trackEvent(container, "order.placed", { order_id, total, item_count })
```
```ts
// fallback-capture.ts
import { trackEvent } from "../utils/analytics";
// replace posthog.capture with trackEvent(container, "recovery.redis_triggered", {...})
// add trackEvent(container, "capture.fallback.triggered", {...}) when fallback runs
```

**Step 4: Run tests to verify they pass**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/order-placed-analytics.unit.spec.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/backend/src/subscribers/order-placed.ts apps/backend/src/jobs/fallback-capture.ts apps/backend/integration-tests/unit/order-placed-analytics.unit.spec.ts apps/backend/integration-tests/unit/fallback-capture-analytics.unit.spec.ts
git commit -m "feat(analytics): migrate order placed and fallback capture events"
```

---

### Task 5: Add analytics to remaining subscribers

**Files:**
- Modify: `apps/backend/src/subscribers/order-canceled.ts`
- Modify: `apps/backend/src/subscribers/customer-created.ts`
- Modify: `apps/backend/src/subscribers/fulfillment-created.ts`
- Modify: `apps/backend/src/subscribers/inventory-backordered.ts`
- Test: `apps/backend/integration-tests/unit/subscribers-analytics.unit.spec.ts`

**Step 1: Write the failing test**
```ts
// subscribers-analytics.unit.spec.ts
// invoke each subscriber with mocked container and assert events:
// order.canceled, customer.created, fulfillment.created, inventory.backordered
```

**Step 2: Run test to verify it fails**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/subscribers-analytics.unit.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**
```ts
// Example: order-canceled.ts
import { trackEvent } from "../utils/analytics";
// trackEvent(container, "order.canceled", { order_id: data.id, reason: data.reason })
```

**Step 4: Run test to verify it passes**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/subscribers-analytics.unit.spec.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/backend/src/subscribers/order-canceled.ts apps/backend/src/subscribers/customer-created.ts apps/backend/src/subscribers/fulfillment-created.ts apps/backend/src/subscribers/inventory-backordered.ts apps/backend/integration-tests/unit/subscribers-analytics.unit.spec.ts
git commit -m "feat(analytics): add subscriber event tracking"
```

---

### Task 6: Add workflow analytics for start/success/failure

**Files:**
- Create: `apps/backend/src/workflows/steps/track-analytics-event.ts`
- Modify: `apps/backend/src/workflows/create-order-from-stripe.ts`
- Modify: `apps/backend/src/workflows/cancel-order-with-refund.ts`
- Modify: `apps/backend/src/workflows/add-item-to-order.ts`
- Modify: `apps/backend/src/workflows/update-line-item-quantity.ts`
- Modify: `apps/backend/src/workflows/send-order-canceled.ts`
- Modify: `apps/backend/src/workflows/send-shipping-confirmation.ts`
- Modify: `apps/backend/src/workflows/send-welcome-email.ts`
- Test: `apps/backend/integration-tests/unit/workflow-analytics-step.unit.spec.ts`

**Step 1: Write the failing test**
```ts
// workflow-analytics-step.unit.spec.ts
import { describe, it, expect, vi } from "vitest";
import { trackWorkflowEventStep } from "../../src/workflows/steps/track-analytics-event";
// execute step with mocked container.analytics.track and assert event name
```

**Step 2: Run test to verify it fails**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/workflow-analytics-step.unit.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**
```ts
// track-analytics-event.ts
import { createStep } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
export const trackWorkflowEventStep = createStep(
  "track-workflow-event",
  async (input: { event: string; actor_id?: string; properties?: Record<string, unknown> }, { container }) => {
    const analytics = container.resolve(Modules.ANALYTICS);
    await analytics.track({ event: input.event, actor_id: input.actor_id, properties: input.properties });
  }
);
```

**Step 4: Run test to verify it passes**
Run: `cd apps/backend && pnpm test -- --runInBand integration-tests/unit/workflow-analytics-step.unit.spec.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/backend/src/workflows/steps/track-analytics-event.ts apps/backend/integration-tests/unit/workflow-analytics-step.unit.spec.ts
git commit -m "feat(analytics): add workflow tracking step"
```

---

### Task 7: Remove posthog-node and cleanup docs/envs

**Files:**
- Delete: `apps/backend/src/utils/posthog.ts`
- Delete: `apps/backend/integration-tests/unit/posthog.unit.spec.ts`
- Delete: `apps/backend/integration-tests/unit/posthog-error-tracking.unit.spec.ts`
- Modify: `apps/backend/package.json`
- Modify: `apps/backend/.env.example`
- Modify: `docs/reference/env-registry.md`

**Step 1: Write the failing test (dependency removal)**
```ts
// Replace posthog tests with analytics utility tests already added
```

**Step 2: Run tests to verify they fail**
Run: `cd apps/backend && pnpm test -- --runInBand`
Expected: FAIL (posthog tests removed / references not yet updated)

**Step 3: Write minimal implementation**
- Remove `posthog-node` from `apps/backend/package.json`.
- Remove `POSTHOG_API_KEY` from backend `.env.example` and env registry.
- Delete `utils/posthog.ts` and update imports to use analytics utility instead.

**Step 4: Run tests to verify they pass**
Run: `cd apps/backend && pnpm test -- --runInBand`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/backend/package.json apps/backend/.env.example docs/reference/env-registry.md
git rm apps/backend/src/utils/posthog.ts apps/backend/integration-tests/unit/posthog.unit.spec.ts apps/backend/integration-tests/unit/posthog-error-tracking.unit.spec.ts
git commit -m "chore(analytics): remove posthog-node and update env docs"
```

---

### Task 8: Full validation

**Files:**
- None (verification only)

**Step 1: Run backend unit tests**
Run: `cd apps/backend && pnpm test`
Expected: PASS

**Step 2: Run typecheck**
Run: `cd apps/backend && pnpm typecheck`
Expected: PASS

**Step 3: Manual validation checklist**
- Dev: set `LOG_LEVEL=debug` as system env var and verify local provider logs analytics events.
- Staging/Prod: confirm PostHog receives `log.info`, `order.placed`, and `system.health_check` events.

**Step 4: Commit (if any docs/notes changed)**
```bash
git add docs/plans/2026-01-20-backend-analytics-migration.md
git commit -m "docs: add backend analytics migration plan"
```

