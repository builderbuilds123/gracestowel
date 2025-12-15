# Story 3.4: End-to-End Order Confirmation Flow

Status: Drafted

## Story

As a **developer**,
I want **to verify the complete order confirmation email flow works end-to-end**,
So that **we have confidence the feature works before release**.

## Acceptance Criteria

### AC1: Guest Order E2E

**Given** a guest places an order in the storefront
**When** the order is successfully created
**Then** within 5 minutes, the guest receives an order confirmation email
**And** the email contains the correct order details
**And** the email contains a working magic link
**And** clicking the magic link opens the order page in the storefront

### AC2: Registered Customer E2E

**Given** a registered customer places an order
**When** the order is successfully created
**Then** within 5 minutes, the customer receives an order confirmation email
**And** the email contains the correct order details
**And** the email does NOT contain a magic link
**And** the email instructs them to log in to view their order

### AC3: Failure Resilience

**Given** the Resend API is temporarily unavailable
**When** an order is placed
**Then** the order completes successfully (not blocked)
**And** the email job retries 3 times
**And** if all retries fail, the job moves to DLQ
**And** an alert is triggered (logged)

### AC4: Magic Link Functionality

**Given** a guest receives an order confirmation email
**When** they click the magic link within 1 hour
**Then** they are authenticated and can view their order
**And** they can modify the order (add items, change address)

## Technical Requirements

### Test File to Create

`apps/backend/integration-tests/integration/email-flow.integration.spec.ts`

### Test Implementation

```typescript
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import { createOrder, createGuestOrder } from "../helpers/order-factory"
import { getEmailQueue } from "../../src/lib/email-queue"
import { ModificationTokenService } from "../../src/services/modification-token"

describe("Email Flow Integration", () => {
  describe("Guest Order Flow", () => {
    it("should queue email with magic link for guest order", async () => {
      // Create guest order
      const order = await createGuestOrder({
        email: "guest@example.com",
        items: [{ variant_id: "variant_123", quantity: 2 }],
      })
      
      // Wait for subscriber to process
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Check queue for job
      const queue = getEmailQueue()
      const jobs = await queue.getJobs(["waiting", "active", "completed"])
      const emailJob = jobs.find(j => j.data.orderId === order.id)
      
      expect(emailJob).toBeDefined()
      expect(emailJob.data.template).toBe("order_confirmation")
      expect(emailJob.data.recipient).toBe("guest@example.com")
      expect(emailJob.data.data.magicLink).toBeTruthy()
      expect(emailJob.data.data.magicLink).toContain(`/order/status/${order.id}?token=`)
    })

    it("should have valid magic link token", async () => {
      const order = await createGuestOrder({ email: "guest@example.com" })
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const queue = getEmailQueue()
      const jobs = await queue.getJobs(["waiting", "active", "completed"])
      const emailJob = jobs.find(j => j.data.orderId === order.id)
      
      // Extract token from magic link
      const url = new URL(emailJob.data.data.magicLink)
      const token = url.searchParams.get("token")
      
      // Validate token
      const tokenService = new ModificationTokenService()
      const result = tokenService.validateToken(token)
      
      expect(result.valid).toBe(true)
      expect(result.payload.order_id).toBe(order.id)
    })
  })

  describe("Registered Customer Flow", () => {
    it("should queue email without magic link for registered customer", async () => {
      const order = await createOrder({
        customer_id: "cust_123",
        email: "customer@example.com",
      })
      
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const queue = getEmailQueue()
      const jobs = await queue.getJobs(["waiting", "active", "completed"])
      const emailJob = jobs.find(j => j.data.orderId === order.id)
      
      expect(emailJob).toBeDefined()
      expect(emailJob.data.data.magicLink).toBeNull()
      expect(emailJob.data.data.isGuest).toBe(false)
    })
  })

  describe("Failure Resilience", () => {
    it("should retry on Resend failure", async () => {
      // Mock Resend to fail
      jest.spyOn(resendService, "send").mockRejectedValue(new Error("API Error"))
      
      const order = await createGuestOrder({ email: "test@example.com" })
      
      // Wait for retries (1s + 2s + 4s + buffer)
      await new Promise(resolve => setTimeout(resolve, 10000))
      
      const queue = getEmailQueue()
      const failedJobs = await queue.getJobs(["failed"])
      const emailJob = failedJobs.find(j => j.data.orderId === order.id)
      
      expect(emailJob).toBeDefined()
      expect(emailJob.attemptsMade).toBe(3)
    }, 15000)

    it("should move to DLQ after all retries", async () => {
      jest.spyOn(resendService, "send").mockRejectedValue(new Error("API Error"))
      
      const order = await createGuestOrder({ email: "test@example.com" })
      await new Promise(resolve => setTimeout(resolve, 10000))
      
      // Check DLQ
      const redis = getRedisConnection()
      const dlqEntries = await redis.lrange("email:dlq", 0, -1)
      const dlqEntry = dlqEntries
        .map(e => JSON.parse(e))
        .find(e => e.orderId === order.id)
      
      expect(dlqEntry).toBeDefined()
      expect(dlqEntry.attempts).toBe(3)
    }, 15000)

    it("should not block order creation on email failure", async () => {
      // Mock email queue to fail
      jest.spyOn(emailQueue, "add").mockRejectedValue(new Error("Redis unavailable"))
      
      // Order should still be created
      const order = await createGuestOrder({ email: "test@example.com" })
      
      expect(order).toBeDefined()
      expect(order.id).toBeTruthy()
      expect(order.status).toBe("pending") // or whatever initial status
    })
  })
})
```

### Manual Testing Checklist

**Guest Order Flow:**
1. [ ] Place order as guest in storefront
2. [ ] Check email inbox (within 5 minutes)
3. [ ] Verify email contains order details
4. [ ] Verify "Modify Your Order" button is visible
5. [ ] Click magic link
6. [ ] Verify order page loads
7. [ ] Verify can modify order (add item)

**Registered Customer Flow:**
1. [ ] Log in to account
2. [ ] Place order
3. [ ] Check email inbox
4. [ ] Verify email contains order details
5. [ ] Verify NO magic link button
6. [ ] Verify "log in to view" message

**Failure Scenario:**
1. [ ] Stop Redis temporarily
2. [ ] Place order
3. [ ] Verify order completes
4. [ ] Start Redis
5. [ ] Check logs for `[EMAIL][ERROR]`

## Tasks / Subtasks

- [ ] Create integration test file
- [ ] Implement guest order email test
- [ ] Implement magic link validation test
- [ ] Implement registered customer test
- [ ] Implement retry behavior test
- [ ] Implement DLQ test
- [ ] Implement non-blocking test
- [ ] Create test helpers (order factory)
- [ ] Run manual testing checklist
- [ ] Document any issues found

## Testing Requirements

### Integration Tests

All tests in `apps/backend/integration-tests/integration/email-flow.integration.spec.ts`:

- [ ] Guest order triggers email with magic link
- [ ] Magic link token is valid and decodable
- [ ] Registered order triggers email without magic link
- [ ] Resend failure triggers retry
- [ ] Exhausted retries move to DLQ
- [ ] Order creation succeeds when email fails

### Test Command

```bash
cd apps/backend && TEST_TYPE=integration npx jest integration-tests/integration/email-flow.integration.spec.ts --testTimeout=20000
```

## Definition of Done

- [ ] Integration test: guest order triggers email with magic link
- [ ] Integration test: registered order triggers email without magic link
- [ ] Integration test: magic link URL is valid and accessible
- [ ] Integration test: Resend failure triggers retry
- [ ] Integration test: exhausted retries move to DLQ
- [ ] Manual test: place real order, receive real email, click magic link
- [ ] All tests pass in CI
- [ ] No regressions in existing tests

## Dev Notes

### Test Timeouts

Email retry tests need longer timeouts (15-20 seconds) to account for:
- Retry delays (1s + 2s + 4s = 7s)
- Processing time
- Queue polling intervals

### Test Isolation

Each test should:
- Create its own order (unique ID)
- Clean up after itself (or use test transactions)
- Not depend on other tests

### Mocking Resend

For failure tests, mock the Resend service:
```typescript
jest.spyOn(resendService, "send").mockRejectedValue(new Error("API Error"))
```

Remember to restore mocks after each test.

### Real Email Testing

For manual testing, use a real email address you can access. Consider:
- Personal email
- Resend test mode (if available)
- Email testing service (Mailinator, etc.)

## References

- [Email Queue (Story 1.1)](docs/sprint/sprint-artifacts/email-1-1-create-email-queue-service.md)
- [Magic Link (Story 3.2)](docs/sprint/sprint-artifacts/email-3-2-generate-magic-link-for-guests.md)
- [DLQ (Story 2.2)](docs/sprint/sprint-artifacts/email-2-2-implement-dead-letter-queue.md)
- [Architecture Doc](docs/product/architecture/transactional-email-architecture.md)

## Dev Agent Record

_To be filled by implementing agent_

### Agent Model Used
_Model name_

### Completion Notes
_Implementation notes_

### File List
| File | Change |
|------|--------|
| `apps/backend/integration-tests/integration/email-flow.integration.spec.ts` | Created |
| `apps/backend/integration-tests/helpers/order-factory.ts` | Created/Modified |

### Change Log
_Code review follow-ups_
