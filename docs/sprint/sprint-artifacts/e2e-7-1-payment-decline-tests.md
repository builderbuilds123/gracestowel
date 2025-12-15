# Story 7-1: Create Payment Decline Test Suite

**Epic:** Epic 7 - Payment Error Flow Testing  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR14.1, FR9.2

---

## User Story

As a **developer**,  
I want **tests that verify payment decline handling**,  
So that **customers see appropriate error messages and can retry**.

---

## Acceptance Criteria

### AC1: Generic Decline Error
**Given** a payment with generic decline test card  
**When** the payment is submitted  
**Then** "Your card was declined" error is displayed

### AC2: Insufficient Funds Error
**Given** a payment with insufficient funds test card  
**When** the payment is submitted  
**Then** "Your card has insufficient funds" error is displayed

### AC3: Retry After Decline
**Given** a declined payment  
**When** the customer enters a different card  
**Then** they can retry the payment

---

## Implementation Tasks

### Task 1: Create Decline Tests
**File:** `apps/e2e/tests/payment/payment-decline.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Payment Decline Handling', () => {
  test('should show generic decline error', async ({ page, dataFactory, payment }) => {
    const product = await dataFactory.getRandomProduct();
    await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
    
    await page.goto('/checkout');
    
    // Fill payment with decline card
    const cardDetails = payment.getCardDetails('DECLINE_GENERIC');
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="cardnumber"]').fill(cardDetails.number);
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="exp-date"]').fill(cardDetails.expiry);
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="cvc"]').fill(cardDetails.cvc);
    
    await page.getByRole('button', { name: /pay/i }).click();
    
    // Verify error message
    await expect(page.getByText(/card was declined/i)).toBeVisible();
  });
  
  test('should show insufficient funds error', async ({ page, dataFactory, payment }) => {
    const product = await dataFactory.getRandomProduct();
    await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
    
    await page.goto('/checkout');
    
    const cardDetails = payment.getCardDetails('DECLINE_INSUFFICIENT_FUNDS');
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="cardnumber"]').fill(cardDetails.number);
    
    await page.getByRole('button', { name: /pay/i }).click();
    
    await expect(page.getByText(/insufficient funds/i)).toBeVisible();
  });
  
  test('should allow retry with different card', async ({ page, dataFactory, payment }) => {
    const product = await dataFactory.getRandomProduct();
    await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
    
    await page.goto('/checkout');
    
    // First attempt with decline card
    const declineCard = payment.getCardDetails('DECLINE_GENERIC');
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="cardnumber"]').fill(declineCard.number);
    await page.getByRole('button', { name: /pay/i }).click();
    
    await expect(page.getByText(/declined/i)).toBeVisible();
    
    // Retry with success card
    const successCard = payment.getCardDetails('SUCCESS');
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="cardnumber"]').fill(successCard.number);
    await page.getByRole('button', { name: /pay/i }).click();
    
    await page.waitForURL(/\/checkout\/success/);
  });
});
```

---

## Definition of Done

- [x] Generic decline shows correct error
- [x] Insufficient funds shows specific error
- [x] Retry with different card works
- [x] Error messages are user-friendly

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR14.1, FR9.2
- Property 10: Payment Decline Error Display
