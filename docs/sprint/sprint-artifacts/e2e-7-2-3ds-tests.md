# Story 7-2: Create 3D Secure Test Suite

**Epic:** Epic 7 - Payment Error Flow Testing  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR9.3, FR14.2

---

## User Story

As a **developer**,  
I want **tests that verify 3D Secure authentication handling**,  
So that **3DS flows work correctly for both success and failure**.

---

## Acceptance Criteria

### AC1: 3DS Modal Appears
**Given** a payment with 3DS-required test card  
**When** the payment is submitted  
**Then** the 3D Secure authentication modal appears

### AC2: 3DS Success
**Given** 3DS authentication succeeds  
**When** the customer completes authentication  
**Then** the payment proceeds to completion

### AC3: 3DS Failure
**Given** 3DS authentication fails  
**When** the customer fails authentication  
**Then** "Authentication failed" error is displayed and customer can retry

---

## Implementation Tasks

### Task 1: Create 3DS Tests
**File:** `apps/e2e/tests/payment/3ds-authentication.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('3D Secure Authentication', () => {
  test('should show 3DS modal for required card', async ({ page, dataFactory, payment }) => {
    const product = await dataFactory.getRandomProduct();
    await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
    
    await page.goto('/checkout');
    
    // Fill with 3DS required card
    const cardDetails = payment.getCardDetails('REQUIRES_3DS');
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="cardnumber"]').fill(cardDetails.number);
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="exp-date"]').fill(cardDetails.expiry);
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="cvc"]').fill(cardDetails.cvc);
    
    await page.getByRole('button', { name: /pay/i }).click();
    
    // 3DS iframe should appear
    const threeDSFrame = page.frameLocator('iframe[name="stripe-challenge-frame"]');
    await expect(threeDSFrame.locator('body')).toBeVisible({ timeout: 10000 });
  });
  
  test('should complete payment after 3DS success', async ({ page, dataFactory, payment }) => {
    const product = await dataFactory.getRandomProduct();
    await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
    
    await page.goto('/checkout');
    
    const cardDetails = payment.getCardDetails('REQUIRES_3DS');
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="cardnumber"]').fill(cardDetails.number);
    
    await page.getByRole('button', { name: /pay/i }).click();
    
    // Complete 3DS (Stripe test mode auto-completes)
    const threeDSFrame = page.frameLocator('iframe[name="stripe-challenge-frame"]');
    await threeDSFrame.getByRole('button', { name: /complete/i }).click();
    
    // Should redirect to success
    await page.waitForURL(/\/checkout\/success/);
  });
  
  test('should show error after 3DS failure', async ({ page, dataFactory, payment }) => {
    const product = await dataFactory.getRandomProduct();
    await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
    
    await page.goto('/checkout');
    
    // Use 3DS fail card
    const cardDetails = payment.getCardDetails('REQUIRES_3DS_FAIL');
    await page.frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('[name="cardnumber"]').fill(cardDetails.number);
    
    await page.getByRole('button', { name: /pay/i }).click();
    
    // 3DS will fail
    const threeDSFrame = page.frameLocator('iframe[name="stripe-challenge-frame"]');
    await threeDSFrame.getByRole('button', { name: /fail/i }).click();
    
    // Should show authentication error
    await expect(page.getByText(/authentication failed/i)).toBeVisible();
  });
});
```

---

## Definition of Done

- [ ] 3DS modal appears for required cards
- [ ] Successful 3DS completes payment
- [ ] Failed 3DS shows appropriate error
- [ ] Customer can retry after 3DS failure

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR9.3, FR14.2
- Property 11: 3D Secure Challenge Handling
