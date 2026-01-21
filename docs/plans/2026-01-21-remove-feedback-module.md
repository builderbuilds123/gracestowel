# Remove Feedback Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the custom Medusa feedback module and its API surface while keeping PostHog Survey functionality intact.

**Architecture:** Delete the backend feedback module (models/service/migration), unregister it from Medusa config, and remove the store feedback API route and tests. Preserve all PostHog survey components/hooks/utilities in the storefront; confirm no storefront code depends on the feedback endpoint.

**Tech Stack:** Medusa v2 (backend), React Router v7 + Cloudflare Workers (storefront), Vitest, Playwright.

---

### Task 1: Confirm PostHog survey features are isolated from feedback API

**Files:**
- Read: `apps/storefront/app/components/PostHogSurveyTrigger.tsx`
- Read: `apps/storefront/app/hooks/usePostHogSurveys.ts`
- Read: `apps/storefront/app/utils/posthog.ts`
- Read: `apps/storefront/app/routes/*` (search for `/store/feedback` or `/api/feedback` usage)

**Step 1: Write a small grep checklist in the plan (no code)**
- Expected: No direct calls to backend feedback routes from storefront.

**Step 2: Run quick search to verify no usage**
Run: `rg -n "feedback" apps/storefront/app`
Expected: PostHog survey components only; no API calls to `/store/feedback` or `/api/feedback`.

**Step 3: Note verification**
- If any feedback API calls exist, add a subtask to delete or reroute them to PostHog survey triggers.

---

### Task 2: Remove backend feedback API route and tests

**Files:**
- Delete: `apps/backend/src/api/store/feedback/route.ts`
- Delete: `apps/backend/src/api/store/feedback/__tests__/route.spec.ts`

**Step 1: Write failing test expectation (documentation-only)**
- Expected: No tests should reference `/store/feedback` after removal.

**Step 2: Delete the route and its tests**

**Step 3: Run targeted backend tests**
Run: `cd apps/backend && npm test -- --runInBand`
Expected: PASS (excluding any unrelated failures).

---

### Task 3: Remove feedback module registration

**Files:**
- Modify: `apps/backend/medusa-config.ts`

**Step 1: Remove the feedback module entry**
- Delete the `resolve: "./src/modules/feedback"` block.

**Step 2: Run a typecheck**
Run: `pnpm typecheck`
Expected: PASS (excluding unrelated baseline issues).

---

### Task 4: Remove feedback module implementation

**Files:**
- Delete: `apps/backend/src/modules/feedback/index.ts`
- Delete: `apps/backend/src/modules/feedback/service.ts`
- Delete: `apps/backend/src/modules/feedback/models/feedback.ts`
- Delete: `apps/backend/src/modules/feedback/__tests__/service.spec.ts`
- Delete: `apps/backend/src/modules/feedback/migrations/Migration20260113000000.ts`

**Step 1: Remove module files**

**Step 2: Ensure no imports remain**
Run: `rg -n "modules/feedback|FEEDBACK_MODULE|feedback" apps/backend/src`
Expected: No references to the removed module or service.

---

### Task 5: Database cleanup strategy (choose one)

**Files:**
- Create (optional): `apps/backend/src/migrations/RemoveFeedbackTable.ts`

**Step 1: Decide retention**
Options:
- **A. Keep table** (no new migration): preserve historical data; no runtime usage.
- **B. Drop table** (add migration): remove `feedback` table and indexes.

**Step 2 (if B): Write migration**
- Use MikroORM/Medusa migration style and ensure down migration can recreate table if needed.

**Step 3: Run migration (if applicable)**
Run: `cd apps/backend && npm run migrate`
Expected: Migration applied successfully.

---

### Task 6: Update documentation & audit

**Files:**
- Modify: `docs/2026-01-21-medusa-audit.md`
- Modify: `docs/project_context.md` (if you track module removals)

**Step 1: Update audit**
- Mark feedback module removed and note PostHog survey usage as the replacement.

**Step 2: Document operational impact**
- Note that `/store/feedback` endpoint is removed and any consumers must use PostHog survey triggers instead.

---

### Task 7: Verification

**Step 1: Run backend tests**
Run: `cd apps/backend && npm test`
Expected: PASS (excluding baseline failures).

**Step 2: Run storefront tests**
Run: `cd apps/storefront && npm test`
Expected: PASS.

**Step 3: E2E (optional)**
Run: `cd apps/e2e && pnpm test`
Expected: PASS.

---

### Task 8: Commit series

**Commit 1:** Remove feedback API routes + tests
```
git add apps/backend/src/api/store/feedback

git commit -m "chore(backend): remove feedback store api"
```

**Commit 2:** Remove feedback module + config
```
git add apps/backend/medusa-config.ts apps/backend/src/modules/feedback

git commit -m "chore(backend): remove feedback module"
```

**Commit 3 (optional):** Drop feedback table migration
```
git add apps/backend/src/migrations/RemoveFeedbackTable.ts

git commit -m "chore(db): remove feedback table"
```

**Commit 4:** Docs update
```
git add docs/2026-01-21-medusa-audit.md docs/project_context.md

git commit -m "docs: note feedback module removal"
```
