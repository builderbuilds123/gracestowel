# Story: Promotions Module Integration

**Epic**: Promotions & Discounts  
**Story ID**: PROMO-1  
**Status**: 📋 Ready for Development  
**Priority**: Medium  
**Estimated Effort**: 8-13 story points (across all phases)  
**Created**: 2026-01-13  

---

## Overview

Integrate Medusa v2's native Promotions module into Grace's Towel e-commerce platform to support discount codes, automatic promotions, and promotional campaigns.

---

## Problem Statement

Currently, Grace's Towel has no promotional capabilities:

1. **No Promo Code Support**: Customers cannot enter discount codes at checkout
2. **No Automatic Discounts**: No "Free Shipping over $X" or "10% off orders over $Y" functionality
3. **CartProgressBar is Disabled**: The component returns `null` with a TODO to implement via Promotions API
4. **No Campaign Management**: No ability to run time-limited sales or promotional campaigns

### Business Impact

- Lost conversion opportunities (no urgency/incentive mechanisms)
- No ability to run marketing campaigns with trackable codes
- No cart abandonment recovery via discount codes
- Competitors offer promotional features as standard

---

## User Stories

### Primary User Story

**As a** customer,  
**I want** to apply a promotional code at checkout,  
**So that** I can receive a discount on my order.

### Secondary User Stories

**As a** customer,  
**I want** automatic discounts to apply when I meet conditions (e.g., free shipping over $75),  
**So that** I'm rewarded for larger orders without needing to find a code.

**As a** store admin,  
**I want** to create and manage promotional campaigns in the Medusa Admin,  
**So that** I can run sales and marketing initiatives.

**As a** store admin,  
**I want** to see which promotions were applied to each order,  
**So that** I can track campaign effectiveness.

---

## Technical Background

### Medusa v2 Promotions Module

The Promotions module is **bundled with `@medusajs/medusa`** (already installed at v2.12.3). Key features:

| Feature | Description |
|---------|-------------|
| **Promotion Types** | `standard` (percentage/fixed) or `buyget` (Buy X Get Y) |
| **Automatic Promotions** | `is_automatic: true` applies without coupon code |
| **Application Methods** | Target order total, specific items, or shipping |
| **Rules Engine** | Conditions based on customer group, product, region, cart value |
| **Campaigns** | Group promotions with shared dates/budgets |
| **Adjustment Lines** | Discounts recorded as `LineItemAdjustment` / `ShippingMethodAdjustment` |

### Data Model

```typescript
interface Promotion {
  id: string;
  code: string;              // "SUMMER20", "FREESHIP75"
  type: "standard" | "buyget";
  is_automatic: boolean;     // Auto-apply without code entry
  status: "active" | "inactive" | "draft";
  application_method: {
    type: "percentage" | "fixed";
    target_type: "order" | "items" | "shipping";
    value: number;           // 20 for 20%, or 500 for $5.00 fixed
    currency_code: string;
    allocation?: "each" | "across";
    max_quantity?: number;
    apply_to_quantity?: number;
    buy_rules_min_quantity?: number;
  };
  rules?: PromotionRule[];
  campaign_id?: string;
  starts_at?: Date;
  ends_at?: Date;
}

interface PromotionRule {
  attribute: string;        // "cart.total", "items.product.id", "customer.groups.id"
  operator: "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte";
  values: string[];
}
```

### Cart Integration

Promotions apply via **adjustment lines** on cart items and shipping methods:

```typescript
interface Cart {
  // ... existing fields
  promotions?: Promotion[];           // Applied promotions
  discount_total?: number;            // Total discount amount
  items: LineItem[];                  // Each item has adjustments
}

interface LineItem {
  // ... existing fields
  adjustments?: LineItemAdjustment[];
}

interface LineItemAdjustment {
  id: string;
  amount: number;                     // Discount value (negative)
  promotion_id: string;
  code?: string;                      // Promo code if applicable
}
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /store/carts/{id}/promotions` | POST | Apply promo code(s) to cart |
| `DELETE /store/carts/{id}/promotions/{code}` | DELETE | Remove promo code from cart |
| `GET /store/promotions` | GET | List available automatic promotions |
| `POST /admin/promotions` | POST | Create promotion (admin) |
| `GET /admin/promotions` | GET | List all promotions (admin) |

### Core Workflow

```typescript
import { updateCartPromotionsWorkflow } from "@medusajs/core-flows";

await updateCartPromotionsWorkflow(container).run({
  input: {
    cart_id: "cart_123",
    promo_codes: ["SUMMER20"],
    action: "ADD"  // or "REMOVE", "REPLACE"
  }
});
```

---

## Current State Analysis

| Component | Current State | Required Changes |
|-----------|--------------|------------------|
| `CartProgressBar.tsx` | Returns `null` with TODO | Implement progress toward free shipping |
| `medusa-cart.ts` | Has `discount_total` type | Display discounts in cart/checkout |
| `checkout.tsx` | Calculates original total only | Add promo code input, show discounts |
| Backend | No promotion code | None needed (uses Medusa core) |

---

## Acceptance Criteria

### Phase 1: Promo Code Entry (MVP)

#### AC1.1: Promo Code Input Field

**Given** a customer is on the checkout page  
**When** the checkout form loads  
**Then** a promo code input field is displayed with:
- Text input for code entry
- "Apply" button
- Placeholder text: "Enter promo code"
- Field positioned after order summary, before payment

#### AC1.2: Apply Valid Promo Code

**Given** a customer enters a valid promo code (e.g., "WELCOME10")  
**When** they click "Apply" or press Enter  
**Then**:
- POST request sent to `/store/carts/{id}/promotions`
- Cart is refreshed with new totals
- Applied discount is displayed (e.g., "WELCOME10: -$5.00")
- Success message shown: "Promo code applied!"
- Input field is replaced with applied code badge + remove button
- Order total updates to reflect discount

#### AC1.3: Invalid Promo Code Error

**Given** a customer enters an invalid or expired promo code  
**When** they click "Apply"  
**Then**:
- Error message displayed: "Invalid or expired promo code"
- Input field is NOT cleared (allows correction)
- Cart totals remain unchanged
- No network error shown (graceful handling)

#### AC1.4: Remove Applied Promo Code

**Given** a customer has an applied promo code  
**When** they click the remove button (X) on the promo badge  
**Then**:
- DELETE request sent to `/store/carts/{id}/promotions/{code}`
- Cart refreshed with original totals
- Promo code input field reappears
- Message shown: "Promo code removed"

#### AC1.5: Multiple Promo Code Handling

**Given** a customer has already applied one promo code  
**When** they try to apply a second promo code  
**Then**:
- If stackable: Both codes applied, both discounts shown
- If non-stackable: Error message: "This code cannot be combined with other promotions"
- Cart totals update appropriately

#### AC1.6: Discount Display in Order Summary

**Given** a cart has one or more promotions applied  
**When** viewing the order summary  
**Then**:
- Subtotal shown (before discounts)
- Each discount shown as line item: "WELCOME10: -$5.00"
- Shipping cost shown
- Tax shown (if applicable)
- Total shown (after all adjustments)
- Savings highlighted: "You saved $5.00!"

### Phase 2: Automatic Promotions

#### AC2.1: Free Shipping Threshold

**Given** an automatic promotion exists: "Free shipping on orders $75+"  
**And** a customer's cart subtotal is $80  
**When** they proceed to checkout  
**Then**:
- Shipping options show "FREE" for eligible methods
- Cart displays: "🎉 Free shipping applied!"
- No promo code entry required

#### AC2.2: Automatic Promotion Near-Miss

**Given** an automatic promotion exists: "Free shipping on orders $75+"  
**And** a customer's cart subtotal is $65  
**When** they view the cart or checkout  
**Then**:
- Message displayed: "Add $10.00 more for free shipping!"
- CartProgressBar shows visual progress (87% to goal)

#### AC2.3: Automatic Promotion Application

**Given** an automatic promotion with `is_automatic: true` exists  
**When** a cart update causes the cart to meet promotion rules  
**Then**:
- Promotion is automatically applied on next cart refresh
- Discount reflected in totals
- Customer notified: "Discount automatically applied!"

#### AC2.4: Automatic Promotion Removal

**Given** an automatic promotion is applied to a cart  
**When** a cart update causes the cart to no longer meet promotion rules  
**Then**:
- Promotion is automatically removed on next cart refresh
- Totals revert to pre-discount values
- Customer notified: "Free shipping no longer applies to your order"

### Phase 3: CartProgressBar Implementation

#### AC3.1: Progress Bar Display

**Given** an automatic threshold-based promotion exists  
**When** a customer views their cart  
**Then**:
- Progress bar shows percentage toward threshold
- Current amount and goal displayed: "$65 / $75"
- Visual indicator of progress (e.g., filled bar)

#### AC3.2: Goal Reached State

**Given** a customer's cart exceeds the promotion threshold  
**When** viewing the cart  
**Then**:
- Progress bar shows 100% filled
- Celebratory message: "🎉 You unlocked free shipping!"
- Green/success styling applied

#### AC3.3: Dynamic Threshold Loading

**Given** promotion thresholds may change  
**When** the cart page loads  
**Then**:
- Thresholds are fetched from backend (not hardcoded)
- Progress bar updates based on current promotion rules
- Graceful fallback if no threshold promotions exist

### Phase 4: Order Integration

#### AC4.1: Promotion Persistence on Order

**Given** a cart with promotions is checked out  
**When** the order is created  
**Then**:
- Order includes `promotion_id` references
- Order adjustments preserve discount amounts
- Order total reflects discounted price

#### AC4.2: Admin Visibility

**Given** an order was placed with promotions  
**When** an admin views the order in Medusa Admin  
**Then**:
- Applied promotion codes visible
- Discount amounts shown per line item
- Total savings displayed

---

## Technical Requirements

### Files to Create

| File | Purpose |
|------|---------|
| `apps/storefront/app/components/PromoCodeInput.tsx` | Promo code entry component |
| `apps/storefront/app/components/AppliedPromotion.tsx` | Applied promo badge component |
| `apps/storefront/app/components/DiscountSummary.tsx` | Discount display in order summary |
| `apps/storefront/app/hooks/usePromoCode.ts` | Hook for promo code operations |

### Files to Modify

| File | Changes |
|------|---------|
| `apps/storefront/app/routes/checkout.tsx` | Add PromoCodeInput, display discounts |
| `apps/storefront/app/components/CartProgressBar.tsx` | Implement with dynamic thresholds |
| `apps/storefront/app/services/medusa-cart.ts` | Add promotion-related methods |
| `apps/storefront/app/types/product.ts` | Add promotion types |

### No Backend Changes Required

The Medusa v2 Promotions module is fully functional out-of-the-box:
- Admin UI at `/app/promotions` for creating promotions
- Store API endpoints for applying/removing codes
- Automatic promotion evaluation on cart refresh

### API Integration

```typescript
// apps/storefront/app/services/medusa-cart.ts

export class MedusaCartService {
  // ... existing methods

  /**
   * Apply a promo code to cart
   */
  async applyPromoCode(cartId: string, code: string): Promise<Cart> {
    const { cart } = await this.client.store.cart.updatePromotions(cartId, {
      promo_codes: [code],
    });
    return cart;
  }

  /**
   * Remove a promo code from cart
   */
  async removePromoCode(cartId: string, code: string): Promise<Cart> {
    const { cart } = await this.client.store.cart.removePromotions(cartId, {
      promo_codes: [code],
    });
    return cart;
  }

  /**
   * Get available automatic promotions for display
   */
  async getAutomaticPromotions(): Promise<Promotion[]> {
    const { promotions } = await this.client.store.promotion.list({
      is_automatic: true,
    });
    return promotions;
  }
}
```

### Component Structure

```tsx
// apps/storefront/app/components/PromoCodeInput.tsx
interface PromoCodeInputProps {
  cartId: string;
  appliedCodes: string[];
  onApply: (code: string) => Promise<void>;
  onRemove: (code: string) => Promise<void>;
  isLoading: boolean;
  error?: string;
}

export function PromoCodeInput({
  cartId,
  appliedCodes,
  onApply,
  onRemove,
  isLoading,
  error,
}: PromoCodeInputProps) {
  const [code, setCode] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      await onApply(code.trim().toUpperCase());
      setCode("");
    }
  };

  return (
    <div className="promo-code-section">
      {appliedCodes.length > 0 ? (
        <div className="applied-codes">
          {appliedCodes.map((appliedCode) => (
            <AppliedPromotion
              key={appliedCode}
              code={appliedCode}
              onRemove={() => onRemove(appliedCode)}
            />
          ))}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter promo code"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !code.trim()}>
            {isLoading ? "Applying..." : "Apply"}
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

---

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `PromoCodeInput.test.tsx` | Input validation, submit handling, error display |
| `AppliedPromotion.test.tsx` | Badge display, remove button |
| `usePromoCode.test.ts` | Hook state management, API calls |
| `CartProgressBar.test.tsx` | Progress calculation, threshold display |

### Integration Tests

| Test | Description |
|------|-------------|
| Apply valid promo code | Verify discount applied to cart |
| Apply invalid code | Verify error handling |
| Remove promo code | Verify cart reverts to original totals |
| Automatic promotion | Verify promotion applies when threshold met |
| Checkout with promo | Verify order contains discount |

### E2E Tests

| Test | Description |
|------|-------------|
| Full promo code flow | Enter code → See discount → Complete checkout |
| Free shipping threshold | Add items → Reach $75 → See free shipping |
| Error recovery | Invalid code → Retry with valid → Success |

---

## Implementation Phases

### Phase 1: MVP Promo Code Entry (3-5 points)

1. Create `PromoCodeInput.tsx` component
2. Add `usePromoCode` hook
3. Integrate into checkout page
4. Display applied discounts in order summary
5. Error handling for invalid codes

**Deliverable**: Customers can enter and apply promo codes at checkout

### Phase 2: Automatic Promotions (2-3 points)

1. Fetch automatic promotions from API
2. Display automatic discount notifications
3. Handle automatic apply/remove on cart changes

**Deliverable**: Automatic promotions apply without code entry

### Phase 3: CartProgressBar (2-3 points)

1. Refactor `CartProgressBar.tsx` from placeholder
2. Fetch threshold from backend
3. Display progress toward free shipping
4. Celebratory state when threshold reached

**Deliverable**: Visual progress bar toward free shipping

### Phase 4: Polish & Edge Cases (1-2 points)

1. Multiple promo code handling
2. Stacking rules enforcement
3. Campaign date validation
4. Admin order visibility verification

**Deliverable**: Production-ready promotions feature

---

## Definition of Done

### Code Quality
- [ ] All new components have TypeScript types
- [ ] No `any` types used
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] Components follow existing patterns

### Functionality
- [ ] Promo code input visible on checkout
- [ ] Valid codes apply discounts
- [ ] Invalid codes show errors
- [ ] Discounts display in order summary
- [ ] CartProgressBar shows threshold progress
- [ ] Automatic promotions apply correctly

### Testing
- [ ] Unit tests for all new components
- [ ] Integration tests for promo code API
- [ ] E2E test for full promo flow
- [ ] All tests pass in CI

### Documentation
- [ ] Component props documented with JSDoc
- [ ] README updated if needed
- [ ] Promotion setup guide for admins

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Medusa promo API changes | High | Pin Medusa version, test on upgrade |
| Stacking rules complexity | Medium | Start with single-code only, add stacking later |
| Performance on cart refresh | Low | Debounce cart updates, cache promotions |
| Buy X Get Y bugs (GitHub #13265) | Medium | Avoid buyget type initially, use standard |

---

## Out of Scope

- Custom promotion rules (beyond Medusa built-in)
- Referral/affiliate tracking
- Customer-specific promotions (requires customer groups)
- Gift cards (separate Medusa module)
- A/B testing promotions

---

## Dependencies

### Required Before Start
- Medusa Admin accessible for creating test promotions
- At least one test promotion created in admin

### External Dependencies
- `@medusajs/medusa` v2.12+ (already installed)
- No additional packages required

---

## References

### Official Documentation
- [Medusa Promotion Module](https://docs.medusajs.com/resources/commerce-modules/promotion)
- [Promotion Concepts](https://docs.medusajs.com/resources/commerce-modules/promotion/concepts)
- [Manage Cart Promotions](https://docs.medusajs.com/resources/storefront-development/cart/manage-promotions)
- [updateCartPromotionsWorkflow](https://docs.medusajs.com/resources/references/medusa-workflows/updateCartPromotionsWorkflow)
- [Promotions in Orders](https://docs.medusajs.com/resources/commerce-modules/order/promotion-adjustments)
- [Promotion Data Models](https://docs.medusajs.com/resources/references/promotion/models)

### Project Files
- Cart Service: `apps/storefront/app/services/medusa-cart.ts`
- Checkout Page: `apps/storefront/app/routes/checkout.tsx`
- CartProgressBar: `apps/storefront/app/components/CartProgressBar.tsx`
- Product Types: `apps/storefront/app/types/product.ts`

### Related Stories
- Story 9.x: Cart-based shipping (completed)
- Email integration stories (reference pattern for error handling)

---

## Admin Setup Guide (Pre-Development)

### Creating Test Promotions in Medusa Admin

1. Navigate to Medusa Admin → Promotions
2. Click "Create Promotion"
3. Configure test promotions:

**Test Promo 1: Percentage Discount**
```
Code: TEST10
Type: Standard
Application Method: Percentage
Value: 10
Target: Order
Status: Active
```

**Test Promo 2: Free Shipping**
```
Code: FREESHIP
Type: Standard  
Application Method: Percentage
Value: 100
Target: Shipping
Status: Active
```

**Test Promo 3: Automatic Free Shipping**
```
Code: (none - automatic)
Type: Standard
Is Automatic: Yes
Application Method: Percentage
Value: 100
Target: Shipping
Rules: Order total >= $75
Status: Active
```

---

## Appendix: Type Definitions

```typescript
// apps/storefront/app/types/promotion.ts

export interface Promotion {
  id: string;
  code: string | null;
  type: "standard" | "buyget";
  is_automatic: boolean;
  status: "active" | "inactive" | "draft";
  application_method: ApplicationMethod;
  rules?: PromotionRule[];
  campaign_id?: string | null;
  campaign?: Campaign | null;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationMethod {
  id: string;
  type: "percentage" | "fixed";
  target_type: "order" | "items" | "shipping";
  value: number;
  currency_code?: string;
  allocation?: "each" | "across";
  max_quantity?: number;
  apply_to_quantity?: number;
  buy_rules_min_quantity?: number;
}

export interface PromotionRule {
  id: string;
  attribute: string;
  operator: "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte";
  values: PromotionRuleValue[];
}

export interface PromotionRuleValue {
  id: string;
  value: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  starts_at?: string;
  ends_at?: string;
  budget?: CampaignBudget;
}

export interface CampaignBudget {
  id: string;
  type: "spend" | "usage";
  limit: number;
  used: number;
}

export interface LineItemAdjustment {
  id: string;
  item_id: string;
  amount: number;
  promotion_id: string;
  code?: string | null;
  description?: string;
}

export interface ShippingMethodAdjustment {
  id: string;
  shipping_method_id: string;
  amount: number;
  promotion_id: string;
  code?: string | null;
  description?: string;
}

// Extended Cart type with promotions
export interface CartWithPromotions {
  id: string;
  // ... existing cart fields
  promotions?: Promotion[];
  discount_total?: number;
  items: Array<{
    id: string;
    // ... existing item fields
    adjustments?: LineItemAdjustment[];
  }>;
  shipping_methods?: Array<{
    id: string;
    // ... existing shipping fields
    adjustments?: ShippingMethodAdjustment[];
  }>;
}
```

---

*Last Updated: 2026-01-13*
