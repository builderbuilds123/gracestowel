# Emailpass Health Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify Emailpass auth alignment with Medusa v2.12.5 and add thorough automated + manual tests to validate login/register/reset flows.

**Architecture:** Use existing Medusa auth routes in backend and CustomerContext flows in storefront. Add backend integration tests for auth endpoints and a unit test for the password reset subscriber to validate reset link generation + email queueing.

**Tech Stack:** Medusa v2.12.5, Jest (integration), Vitest (unit), React Router v7 storefront, BullMQ email queue.

---

### Task 1: Verify package alignment and config wiring (no code changes)

**Files:**
- Read: `apps/backend/package.json`
- Read: `apps/backend/medusa-config.ts`
- Read: `apps/storefront/app/context/CustomerContext.tsx`

**Step 1: Confirm installed auth provider package name**

Run:
```bash
cat apps/backend/package.json | rg "auth-emailpass"
```
Expected: dependency exists as `@medusajs/auth-emailpass` with version `2.12.5`.

**Step 2: Confirm provider registration uses the same package**

Check `apps/backend/medusa-config.ts`:
```ts
resolve: "@medusajs/auth-emailpass",
id: "emailpass",
```
Expected: matches dependency and `id: "emailpass"`.

**Step 3: Confirm storefront calls the expected auth routes**

Check `apps/storefront/app/context/CustomerContext.tsx` for:
- `POST /auth/customer/emailpass` (login)
- `POST /auth/customer/emailpass/register` (register)
- `POST /auth/customer/emailpass/reset-password` (request reset)
- `POST /auth/customer/emailpass/update-provider` (reset password)

Expected: paths match, token used in `Authorization` header for update-provider.

**Step 4: Note baseline test failure**

Record that `pnpm test` fails due to missing Playwright in `apps/e2e`. Proceed anyway per instruction.

---

### Task 2: Add backend integration tests for Emailpass auth routes

**Files:**
- Create: `apps/backend/integration-tests/http/auth-emailpass.spec.ts`
- Test: `apps/backend/integration-tests/http/auth-emailpass.spec.ts`

**Step 1: Write the failing test**

```ts
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(60 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api }) => {
    describe("Auth Emailpass", () => {
      const email = "emailpass-test@example.com";
      const password = "Password123!";
      let token: string;

      it("registers auth identity and creates customer", async () => {
        const registerRes = await api.post("/auth/customer/emailpass/register", {
          email,
          password,
        });
        expect(registerRes.status).toBe(200);
        expect(registerRes.data).toHaveProperty("token");
        token = registerRes.data.token;

        const customerRes = await api.post(
          "/store/customers",
          { email, first_name: "Test", last_name: "User" },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        expect(customerRes.status).toBe(200);
        expect(customerRes.data.customer.email).toBe(email);
      });

      it("logs in with email/password", async () => {
        const loginRes = await api.post("/auth/customer/emailpass", {
          email,
          password,
        });
        expect(loginRes.status).toBe(200);
        expect(loginRes.data).toHaveProperty("token");
      });

      it("returns customer profile for valid token", async () => {
        const loginRes = await api.post("/auth/customer/emailpass", {
          email,
          password,
        });
        const meRes = await api.get("/store/customers/me", {
          headers: { Authorization: `Bearer ${loginRes.data.token}` },
        });
        expect(meRes.status).toBe(200);
        expect(meRes.data.customer.email).toBe(email);
      });

      it("accepts reset-password request", async () => {
        const resetRes = await api.post("/auth/customer/emailpass/reset-password", {
          identifier: email,
        });
        expect(resetRes.status).toBe(200);
      });
    });
  },
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/backend && npm run test:integration -- auth-emailpass.spec.ts
```
Expected: FAIL (file missing).

**Step 3: Write minimal implementation**

Create `apps/backend/integration-tests/http/auth-emailpass.spec.ts` with the test above.

**Step 4: Run test to verify it passes**

Run:
```bash
cd apps/backend && npm run test:integration -- auth-emailpass.spec.ts
```
Expected: PASS (may require DB/Medusa integration test setup).

**Step 5: Commit**

```bash
git add apps/backend/integration-tests/http/auth-emailpass.spec.ts
git commit -m "test: add emailpass auth integration coverage"
```

---

### Task 3: Add unit test for password reset subscriber email payload

**Files:**
- Create: `apps/backend/src/subscribers/__tests__/customer-password-reset.spec.ts`
- Modify: `apps/backend/src/subscribers/customer-password-reset.ts` (if needed for testability)
- Test: `apps/backend/src/subscribers/__tests__/customer-password-reset.spec.ts`

**Step 1: Write the failing test**

```ts
import customerPasswordResetHandler from "../customer-password-reset";
import { enqueueEmail } from "../../lib/email-queue";
import { getEnv } from "../../lib/env";

jest.mock("../../lib/email-queue", () => ({ enqueueEmail: jest.fn() }));
jest.mock("../../lib/env", () => ({ getEnv: jest.fn() }));

describe("customerPasswordResetHandler", () => {
  it("queues reset email with storefront URL and token", async () => {
    (getEnv as jest.Mock).mockReturnValue({ STOREFRONT_URL: "https://example.com" });

    const query = {
      graph: jest.fn().mockResolvedValue({
        data: [{ id: "cust_1", email: "test@example.com", first_name: "Test" }],
      }),
    };

    const logger = { info: jest.fn(), error: jest.fn() };

    await customerPasswordResetHandler({
      event: { data: { entity_id: "cust_1", token: "tok_123", actor_type: "customer" } },
      container: { resolve: (key: string) => (key === "query" ? query : logger) },
    } as any);

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "test@example.com",
        data: expect.objectContaining({
          reset_url: "https://example.com/account/reset-password?token=tok_123",
        }),
      })
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/backend && npm test -- customer-password-reset.spec.ts
```
Expected: FAIL (file missing).

**Step 3: Write minimal implementation**

Create `apps/backend/src/subscribers/__tests__/customer-password-reset.spec.ts` with the test above. If TypeScript complains about typing of `container`, add a narrow `as unknown as` cast in the test only.

**Step 4: Run test to verify it passes**

Run:
```bash
cd apps/backend && npm test -- customer-password-reset.spec.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/backend/src/subscribers/__tests__/customer-password-reset.spec.ts
git commit -m "test: cover customer password reset subscriber"
```

---

### Task 4: Manual end-to-end verification (backend + storefront)

**Files:**
- Read: `.env`
- Read: `apps/storefront/app/routes/account.reset-password.tsx` (if present)

**Step 1: Verify required envs**

Check `.env` has:
- `AUTH_CORS`, `STORE_CORS`, `ADMIN_CORS`
- `JWT_SECRET`, `COOKIE_SECRET`
- `STOREFRONT_URL` (used for reset URL)

**Step 2: Start services with required log handling**

Run:
```bash
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:9000 | xargs kill -9 2>/dev/null
lsof -ti:9001 | xargs kill -9 2>/dev/null
pnpm dev:api 2>&1 | tee /tmp/gracestowel-api.log
pnpm dev:storefront 2>&1 | tee /tmp/gracestowel-storefront.log
```
Expected: both servers running, logs in `/tmp` files.

**Step 3: Register + login**

Use storefront UI:
- Register a new email/password.
- Log out, then log back in with the same credentials.
- Confirm customer account page loads and `me` request succeeds (no 401).

**Step 4: Reset password**

- Request password reset from UI.
- Confirm subscriber queues email (check `/tmp/gracestowel-api.log` for `[PASSWORD_RESET]`).
- Open reset link and submit new password.
- Log in with new password.

**Step 5: Document results**

Add a short note to `docs/testing/payment-capture-flow-test-plan.md` or create a new `docs/testing/emailpass-test-results.md` summarizing manual results.

---

### Task 5: Optional hardening (only if gaps found)

**Files:**
- Modify: `apps/backend/medusa-config.ts` (hashConfig)

**Step 1: Write failing test (if required)**

Skip unless there’s a documented security requirement. If needed, add a small unit test around hashConfig presence or document-only decision.

**Step 2: Implement hashConfig**

```ts
options: {
  hashConfig: { logN: 15, r: 8, p: 1 },
},
```

**Step 3: Verify auth still works**

Repeat Task 2 integration tests and Task 4 manual flow.

---

## Notes

- Baseline `pnpm test` fails in this worktree due to missing Playwright for `apps/e2e`. Proceeding with targeted tests only.
- Auth provider package name is `@medusajs/auth-emailpass` for Medusa v2.12.5 in this repo.
