# Payment Capture Flow - Comprehensive Test Plan

## Overview

This test plan covers the complete order lifecycle:
1. Order Creation (checkout)
2. Order Modification (add/update items during grace period)
3. Fulfillment Creation
4. Payment Capture (triggered by fulfillment)
5. Fallback Capture (3-day queue job)

Each scenario includes verification steps using:
- **Chrome DevTools**: Network requests, console logs
- **Stripe CLI/API**: PaymentIntent status
- **Database**: Direct PostgreSQL queries
- **Admin UI**: Order status display

## Architecture Note

**All payment captures use Medusa's native `capturePaymentWorkflow`:**
- Both original and supplementary PaymentCollections are captured via the same workflow
- No direct Stripe API calls for capture - Medusa handles the Stripe provider interaction
- The workflow updates PaymentCollection status, Payment.captured_at, and creates OrderTransaction

---

## Capture Architecture

### Fulfillment Path (`captureAllOrderPayments`)

When a fulfillment is created, the hook calls `captureAllOrderPayments()` which:
1. Fetches all PaymentCollections for the order
2. For each PaymentCollection in "authorized" status:
   - Finds the associated Payment record
   - Calls `capturePaymentWorkflow(container).run({ input: { payment_id } })`
3. Returns result with captured/skipped/failed counts

### Fallback Worker Path (`executePaymentCapture`)

When the 3-day fallback job runs:
1. Receives `orderId` and `paymentIntentId` from job data
2. Queries order to find Payment record matching the PaymentIntent ID
3. Calls `capturePaymentWorkflow(container).run({ input: { payment_id } })`
4. Also calls `captureSupplementaryPaymentCollections()` for any supplementary charges

### Key Points
- **No direct Stripe API calls** - All captures go through Medusa's `capturePaymentWorkflow`
- **Unified behavior** - Original and supplementary payments use the same capture mechanism
- **Idempotent** - Already-captured payments are detected and skipped

---

## Prerequisites

### Terminal Setup

```bash
# Terminal 1: Backend API
cd apps/backend
lsof -ti:9000 | xargs kill -9 2>/dev/null
pnpm dev:api 2>&1 | tee /tmp/gracestowel-api.log

# Terminal 2: Storefront
cd apps/storefront
lsof -ti:5173 | xargs kill -9 2>/dev/null
pnpm dev:storefront 2>&1 | tee /tmp/gracestowel-storefront.log

# Terminal 3: Stripe webhook forwarding
stripe listen --forward-to localhost:9000/webhooks/stripe

# Terminal 4: Database access
psql $DATABASE_URL
```

### Environment Variables

Ensure these are set:
```bash
STRIPE_API_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
REDIS_URL=redis://...
PAYMENT_CAPTURE_DELAY_MS=300000  # 5 minutes for testing (default is 3 days)
```

### Test Card Numbers

| Card | Number | Use Case |
|------|--------|----------|
| Success | 4242424242424242 | Standard successful payment |
| Requires Auth | 4000002500003155 | 3D Secure authentication |
| Decline | 4000000000000002 | Card declined |

---

## Scenario 1: Basic Order Flow (No Modifications)

### 1.1 Create Order via Storefront

**Steps:**
1. Open Chrome: `http://localhost:5173`
2. Add product to cart (e.g., quantity 2)
3. Proceed to checkout
4. Enter test card `4242424242424242`
5. Complete checkout
6. Note the Order ID from success page

**Chrome DevTools Verification:**
```
Network tab > Filter: "complete-cart" or "orders"
- POST /store/carts/{id}/complete
- Response should include order.id
```

**Stripe CLI Verification:**
```bash
# Get PaymentIntent ID from order
stripe payment_intents list --limit 1

# Check status
stripe payment_intents retrieve pi_XXXXX
# Expected: status = "requires_capture", capture_method = "manual"
```

**Database Verification:**
```sql
-- Get order details
SELECT
    o.id,
    o.display_id,
    o.status,
    o.currency_code,
    o.metadata->>'edit_status' as edit_status
FROM "order" o
WHERE o.id = 'order_XXXXX';

-- Check PaymentCollection
SELECT
    pc.id,
    pc.status,
    pc.amount,
    pc.metadata
FROM payment_collection pc
JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
WHERE opc.order_id = 'order_XXXXX';
-- Expected: status = "authorized"

-- Check Payment record
SELECT
    p.id,
    p.amount,
    p.captured_at,
    p.data->>'id' as stripe_pi_id
FROM payment p
JOIN payment_collection pc ON p.payment_collection_id = pc.id
JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
WHERE opc.order_id = 'order_XXXXX';
-- Expected: captured_at = NULL
```

**Admin UI Verification:**
1. Open: `http://localhost:9000/app`
2. Navigate to Orders > Select order
3. Expected: Payment status = "Awaiting" or "Authorized"

---

### 1.2 Check Fallback Queue Job

**Redis Verification:**
```bash
# Connect to Redis
redis-cli -u $REDIS_URL

# Check job exists
KEYS bull:payment-capture:*
# Should see: bull:payment-capture:capture-order_XXXXX
```

**Log Verification:**
```bash
grep "capture job" /tmp/gracestowel-api.log | tail -5
# Should see: "Payment capture scheduled successfully"
```

---

### 1.3 Create Fulfillment (Triggers Capture)

**Admin UI Steps:**
1. In order detail page, click "Create Fulfillment"
2. Select all items
3. Click "Create"

**Chrome DevTools Verification:**
```
Network tab > Filter: "fulfillments"
- POST /admin/orders/{id}/fulfillments
- Response: 200 OK
```

**Log Verification:**
```bash
grep -E "(fulfillment-hook|payment-capture-core)" /tmp/gracestowel-api.log | tail -15
# Expected logs:
# "[fulfillment-hook] Hook triggered for fulfillment..."
# "Capturing all payments for order..."
# "Capturing original payment..." (uses capturePaymentWorkflow)
# "Original payment captured..."
# "[fulfillment-hook] Payment capture completed..."
# "[fulfillment-hook] Removed fallback capture job..."
```

**Stripe CLI Verification:**
```bash
stripe payment_intents retrieve pi_XXXXX
# Expected: status = "succeeded"
```

**Database Verification:**
```sql
-- Check PaymentCollection status
SELECT
    pc.id,
    pc.status,
    pc.amount
FROM payment_collection pc
JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
WHERE opc.order_id = 'order_XXXXX';
-- Expected: status = "completed"

-- Check Payment captured
SELECT
    p.id,
    p.captured_at,
    p.data->>'id' as stripe_pi_id
FROM payment p
JOIN payment_collection pc ON p.payment_collection_id = pc.id
JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
WHERE opc.order_id = 'order_XXXXX';
-- Expected: captured_at = timestamp (NOT NULL)

-- Verify fallback job removed
-- (Check Redis - job should be gone)
```

**Admin UI Verification:**
1. Refresh order page
2. Expected: Payment status = "Captured" or "Paid"
3. Fulfillment status = "Fulfilled"

---

## Scenario 2: Order with Modification (Supplementary Charge)

### 2.1 Create Order

Follow steps in Scenario 1.1

**Note the modification token from:**
- Success page URL query param, or
- Email confirmation

### 2.2 Modify Order (Add Items)

**API Call:**
```bash
curl -X POST "http://localhost:9000/store/orders/{ORDER_ID}/batch-modifications" \
  -H "Content-Type: application/json" \
  -H "x-modification-token: {TOKEN}" \
  -d '{
    "items": [{
      "action": "update_quantity",
      "item_id": "{LINE_ITEM_ID}",
      "quantity": 3
    }]
  }'
```

**Expected Response:**
```json
{
  "payment_status": "supplementary_authorized",
  "supplementary_charge_created": true,
  "supplementary_payment_collection_id": "paycol_XXX",
  "supplementary_amount": 5000
}
```

**Database Verification:**
```sql
-- Check TWO PaymentCollections exist
SELECT
    pc.id,
    pc.status,
    pc.amount,
    pc.metadata->>'supplementary_charge' as is_supplementary
FROM payment_collection pc
JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
WHERE opc.order_id = 'order_XXXXX'
ORDER BY pc.created_at;
-- Expected: 2 rows
-- Row 1: is_supplementary = NULL, status = "authorized"
-- Row 2: is_supplementary = "true", status = "authorized"

-- Check supplementary Payment record
SELECT
    p.id,
    p.amount,
    p.captured_at,
    p.data->>'id' as stripe_pi_id,
    pc.metadata->>'supplementary_charge' as is_supplementary
FROM payment p
JOIN payment_collection pc ON p.payment_collection_id = pc.id
JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
WHERE opc.order_id = 'order_XXXXX';
-- Expected: 2 rows, both with captured_at = NULL
```

**Stripe Verification:**
```bash
# List recent PaymentIntents (should be 2)
stripe payment_intents list --limit 2

# Both should have:
# - status: "requires_capture"
# - capture_method: "manual"
```

---

### 2.3 Create Fulfillment (Captures BOTH Payments)

**Admin UI Steps:**
1. Navigate to order
2. Create fulfillment for all items

**Log Verification:**
```bash
grep -E "(fulfillment-hook|payment-capture-core)" /tmp/gracestowel-api.log | tail -20
# Expected:
# "[fulfillment-hook] Hook triggered for fulfillment..."
# "Capturing all payments for order..."
# "Capturing original payment..." (via capturePaymentWorkflow)
# "Original payment captured..."
# "Capturing supplementary payment..." (via capturePaymentWorkflow)
# "Supplementary payment captured..."
# "[fulfillment-hook] Payment capture completed for order... (captured: 2, skipped: 0)"
# "[fulfillment-hook] Removed fallback capture job..."
```

**Note:** Both original and supplementary payments are captured using Medusa's native `capturePaymentWorkflow` - no direct Stripe API calls.

**Database Verification:**
```sql
-- Both PaymentCollections should be completed
SELECT
    pc.id,
    pc.status,
    pc.metadata->>'supplementary_charge' as is_supplementary
FROM payment_collection pc
JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
WHERE opc.order_id = 'order_XXXXX';
-- Expected: Both rows have status = "completed"

-- Both Payments should be captured
SELECT
    p.id,
    p.captured_at,
    pc.metadata->>'supplementary_charge' as is_supplementary
FROM payment p
JOIN payment_collection pc ON p.payment_collection_id = pc.id
JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
WHERE opc.order_id = 'order_XXXXX';
-- Expected: Both rows have captured_at = timestamp
```

**Stripe Verification:**
```bash
stripe payment_intents list --limit 2
# Both should have status = "succeeded"
```

**Admin UI Verification:**
1. Refresh order page
2. Payment status should show "Captured" (NOT "Partially captured")

---

## Scenario 3: Partial Fulfillment

### 3.1 Create Order with Multiple Items

1. Add Product A (qty 2) + Product B (qty 1) to cart
2. Complete checkout
3. Note Order ID

### 3.2 First Partial Fulfillment

**Admin UI Steps:**
1. Create fulfillment for Product A only (qty 2)

**Expected Behavior:**
- ALL payments are captured on first fulfillment
- Fallback job is removed

**Log Verification:**
```bash
grep "fulfillment-hook" /tmp/gracestowel-api.log | tail -10
# Expected:
# "Payment capture completed for order... (captured: 1, skipped: 0)"
# "Removed fallback capture job..."
```

**Database Verification:**
```sql
SELECT pc.id, pc.status
FROM payment_collection pc
JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
WHERE opc.order_id = 'order_XXXXX';
-- Expected: status = "completed"
```

### 3.3 Second Partial Fulfillment

**Admin UI Steps:**
1. Create fulfillment for Product B (qty 1)

**Expected Behavior:**
- Payments already captured, skipped
- No error, fulfillment succeeds

**Log Verification:**
```bash
grep "fulfillment-hook" /tmp/gracestowel-api.log | tail -5
# Expected:
# "All payments already captured for order... - previous fulfillment handled capture (skipped: 1)"
```

---

## Scenario 4: Fallback Capture (Queue Job)

### 4.1 Setup

Set short delay for testing:
```bash
PAYMENT_CAPTURE_DELAY_MS=60000  # 1 minute
```

Restart backend.

### 4.2 Create Order (No Fulfillment)

1. Complete checkout
2. Wait for fallback job to execute (~1 minute)

**Log Verification:**
```bash
grep -E "(payment-capture-worker|payment-capture-core)" /tmp/gracestowel-api.log | tail -15
# Expected:
# "Processing payment capture job..."
# "Executing payment capture..." (resolves Payment by PI ID)
# "Payment captured via workflow..." (uses capturePaymentWorkflow)
# "Payment capture executed successfully..."
```

**Note:** The fallback worker now resolves the Payment record by PaymentIntent ID and uses `capturePaymentWorkflow` for capture (no direct Stripe API calls).

**Database Verification:**
```sql
SELECT pc.status
FROM payment_collection pc
JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
WHERE opc.order_id = 'order_XXXXX';
-- Expected: status = "completed" (captured by fallback)
```

---

## Scenario 5: Error Handling - Capture Failure

### 5.1 Simulate Stripe Failure

Use a PaymentIntent that's already expired/canceled:
1. Create order
2. Cancel PaymentIntent in Stripe dashboard
3. Attempt fulfillment

**Expected Behavior:**
- Fulfillment rolls back
- Admin notification sent
- Error in logs

**Log Verification:**
```bash
grep "fulfillment-hook" /tmp/gracestowel-api.log | tail -10
# Expected:
# "Failed to capture PaymentCollection..."
# "ADMIN_NOTIF][SENT] type=payment_failed..."
```

**Admin UI Verification:**
1. Check notification feed (bell icon)
2. Should see "Payment Capture Failed" notification

---

## Scenario 6: Order Cancellation (Before Fulfillment)

### 6.1 Create Order

Complete checkout, note Order ID.

### 6.2 Cancel Order

**Admin UI Steps:**
1. Navigate to order
2. Click "Cancel Order"
3. Confirm cancellation

**Expected Behavior:**
- PaymentIntent refunded/canceled
- Fallback job removed
- Order status = "canceled"

**Stripe Verification:**
```bash
stripe payment_intents retrieve pi_XXXXX
# Expected: status = "canceled" or has refund
```

**Database Verification:**
```sql
SELECT status FROM "order" WHERE id = 'order_XXXXX';
-- Expected: status = "canceled"
```

**Redis Verification:**
```bash
redis-cli -u $REDIS_URL KEYS "bull:payment-capture:*order_XXXXX*"
# Expected: (empty array) - job removed
```

---

## Verification Checklist

### For Each Scenario

| Check | Tool | Query/Command |
|-------|------|---------------|
| Order created | DB | `SELECT * FROM "order" WHERE id = ?` |
| PaymentCollection status | DB | `SELECT status FROM payment_collection WHERE ...` |
| Payment captured_at | DB | `SELECT captured_at FROM payment WHERE ...` |
| Stripe PI status | Stripe CLI | `stripe payment_intents retrieve pi_XXX` |
| Fallback job exists/removed | Redis | `KEYS bull:payment-capture:*` |
| Admin UI status | Browser | Check order detail page |
| Logs | Terminal | `grep "fulfillment-hook" /tmp/gracestowel-api.log` |

---

## Quick SQL Queries

```sql
-- Full order payment state
SELECT
    o.id as order_id,
    o.display_id,
    o.status as order_status,
    pc.id as pc_id,
    pc.status as pc_status,
    pc.amount as pc_amount,
    pc.metadata->>'supplementary_charge' as is_supplementary,
    p.id as payment_id,
    p.captured_at,
    p.data->>'id' as stripe_pi_id
FROM "order" o
LEFT JOIN order_payment_collection opc ON o.id = opc.order_id
LEFT JOIN payment_collection pc ON opc.payment_collection_id = pc.id
LEFT JOIN payment p ON p.payment_collection_id = pc.id
WHERE o.id = 'order_XXXXX';

-- Check all pending payments (not captured)
SELECT
    o.id as order_id,
    o.display_id,
    pc.id as pc_id,
    pc.status,
    p.captured_at
FROM "order" o
JOIN order_payment_collection opc ON o.id = opc.order_id
JOIN payment_collection pc ON opc.payment_collection_id = pc.id
JOIN payment p ON p.payment_collection_id = pc.id
WHERE p.captured_at IS NULL
ORDER BY o.created_at DESC
LIMIT 20;
```

---

## Stripe CLI Commands

```bash
# List recent PaymentIntents
stripe payment_intents list --limit 5

# Get specific PaymentIntent
stripe payment_intents retrieve pi_XXXXX

# Cancel a PaymentIntent (for testing failure scenarios)
stripe payment_intents cancel pi_XXXXX

# Capture manually (for debugging)
stripe payment_intents capture pi_XXXXX
```

---

## Expected Final State Summary

| Scenario | PC Status | Payment captured_at | Stripe PI Status | Fallback Job |
|----------|-----------|---------------------|------------------|--------------|
| Basic flow after fulfillment | completed | timestamp | succeeded | removed |
| With supplementary after fulfillment | both completed | both timestamps | both succeeded | removed |
| Partial fulfillment (2nd) | completed | timestamp | succeeded | already removed |
| Fallback capture (no fulfillment) | completed | timestamp | succeeded | processed & done |
| Capture failure | authorized | NULL | varies | still exists |
| Order canceled | varies | NULL or refund | canceled | removed |
