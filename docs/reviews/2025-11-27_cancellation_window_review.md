# Plan Review: 1-Hour Order Cancellation & Modification Window

**Date**: 2025-11-27
**Reviewer**: Plan Reviewer Agent
**Target PRD**: [1_hour_cancellation_window.md](file:///Users/leonliang/Github%20Repo/gracestowel/docs/prd/1_hour_cancellation_window.md)

## 1. Executive Summary

The PRD for the 1-Hour Cancellation & Modification Window is **well-structured and comprehensive**, addressing the core user needs and critical security concerns (Modification Token). The addition of the "Upsell" functionality significantly increases the complexity of the payment flow.

**Verdict**: **Approved with Conditions**. The plan is solid, but the "Upsell" payment logic requires more granular technical definition to avoid "stuck" orders where items are added but payment fails.

## 2. Critical Issues & Risks

### 2.1. Payment Delta Handling (High Risk)
*   **Issue**: The PRD mentions "Prompt user to authorize/pay Delta". If the original payment was a "Guest" checkout, we likely do not have a saved payment method ID (`pm_...`) that can be charged off-session without re-entering card details.
*   **Risk**: The user adds an item, clicks "Confirm", but the background charge fails (requires 3DS, or no saved card).
*   **Recommendation**: The "Add Item" flow **MUST** include a frontend payment step (Stripe Elements) to collect card details for the delta amount if a saved payment method is not available or fails. It cannot be purely a backend "charge saved card" operation for guest users.

### 2.2. Inventory Race Conditions (Medium Risk)
*   **Issue**: The flow describes: `Select -> Check Inventory -> Recalc -> Pay -> Confirm`.
*   **Risk**: Between "Check Inventory" and "Pay", the item could go out of stock.
*   **Recommendation**: Implement a temporary **Inventory Reservation** (e.g., for 5 minutes) when the user enters the "Add Item" checkout flow, similar to a standard cart checkout.

### 2.3. Tax Recalculation Complexity (Medium Risk)
*   **Issue**: Adding items or changing address requires re-calculating taxes.
*   **Risk**: If the tax provider (e.g., Stripe Tax) service is down or returns an error, the modification fails.
*   **Recommendation**: Ensure graceful error handling. If tax cannot be calculated, block the modification rather than allowing it with $0 tax.

## 3. Gaps & Missing Considerations

### 3.1. "Partial" Cancellations
*   **Gap**: The PRD covers full cancellation and adding items. It explicitly excludes *removing* individual items ("Constraint: Cannot remove items").
*   **Impact**: Users who want to remove 1 item of 3 will have to cancel the entire order and re-buy 2 items. This is a valid MVP trade-off but should be communicated clearly to the user (e.g., "To remove items, please cancel and reorder").

### 3.2. Discount Code Compatibility
*   **Gap**: If the original order used a discount code (e.g., "SAVE20"), does it apply to the *added* items?
*   **Recommendation**: Define the rule. Ideally, the discount should apply to the new items if it's a percentage off. If it's a fixed amount, it shouldn't apply twice. Medusa's Order Edit logic handles this, but verify the behavior.

## 4. Implementation Recommendations

### 4.1. Refined Upsell Flow
1.  **User**: Clicks "Add [Item]".
2.  **System**: Creates an **Order Edit** in Medusa (Draft state).
3.  **System**: Returns the `payment_collection` details (delta amount).
4.  **Frontend**: If `delta > 0`, renders Stripe Payment Element for the difference.
5.  **User**: Enters card / Confirms payment.
6.  **System**: Captures payment -> Confirms Order Edit -> Updates Inventory.

### 4.2. Testing Strategy
*   **Scenario**: Guest user, 59 minutes after order, adds item, payment requires 3DS.
*   **Scenario**: User cancels order while Warehouse job is running (Race condition test).

## 5. Conclusion

The PRD is ready for implementation planning, provided the **Payment Delta** flow is treated as a full "mini-checkout" experience rather than a simple background charge. The security model (Tokens) is excellent.

**Next Steps**:
1.  Update PRD to clarify "Mini-Checkout" for Upsells.
2.  Proceed to Implementation Plan.
