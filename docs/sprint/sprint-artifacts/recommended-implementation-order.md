# Recommended Implementation Order

This document outlines the strategic execution order for the Checkout Flow Audit fixes. The order is determined by **dependencies** (blockers first), **risk/severity** (critical security/data integrity first), and **logical workflow** (checkout -> order creation -> modifications).

## Legend
- 🔴 **Critical**: Must be done immediately.
- 🟠 **High**: Major functional or data integrity gap.
- 🟡 **Medium**: Reliability, performance, or UX improvement.
- ✅ **Done**: Implementation complete.

## Phase 1: Foundation & Critical Security
*Goal: Fix monetary units, secure the perimeter, and stop critical data corruption.*

1.  **fix-SEC-04-client-secret-leak** (� High)
    *   **Reason**: High security risk (PII/Session takeover). Isolated fix in frontend.
2.  **fix-SEC-05-localstorage-token** (🟠 High)
    *   **Reason**: High security risk (XSS/Persistence). Isolated fix in frontend.
3.  **fix-SEC-03-token-expiry-anchoring** (🟠 High)
    *   **Reason**: Security regression protection for modification tokens.

## Phase 2: Core Checkout Integrity
*Goal: Ensure the "Main Happy Path" (Checkout -> Order) records correct data.*

4.  **fix-SHP-01-shipping-option-persistence** (🟠 High)
    *   **Reason**: Ensures orders have valid shipping methods linked to options, critical for fulfillment logic.
5.  **fix-ORD-03-address-update-token** (🟠 High)
    *   **Reason**: Quick fix for a broken "Happy Path" feature (Address editing); low effort, high value.

## Phase 3: Order Management Correctness
*Goal: Fix broken modification logic (Grace Period features).*

6.  **fix-INV-01-inventory-decrement** (🟠 High)
    *   **Reason**: Prevents overselling. Critical for data integrity during high concurrency.
7.  **fix-ORD-01-add-items-workflow** (🟠 High)
    *   **Reason**: "Add Item" feature is currently broken (metadata only). Needs real implementation to be usable.
8.  **fix-ORD-02-post-auth-amount** (🟠 High)
    *   **Reason**: Fixes payment failures when modifying orders. closely related to ORD-01.

## Phase 4: Reliability & Performance
*Goal: Harden the system for scale.*

9.  **fix-RET-02-payment-intent-order-link** (N/A)
    *   **Reason**: Optimizes lookup performance (O(1)). Supports reliable webhook processing.
10. **fix-CONC-01-edit-status-locking** (🟡 Medium)
    *   **Reason**: Prevents race conditions between capture and modification. Important as volume grows.
11. **fix-PERF-01-stock-validation** (🟡 Medium)
    *   **Reason**: Speed up checkout. Good to have, less critical than correctness/security.

## Phase 5: Operational & UX Compliance
*Goal: Improve admin visibility and customer experience.*

12. **fix-FUL-01-fulfillment-tracking** (🟡 Medium)
    *   **Reason**: Automates/fixes shipping confirmations. Operational improvement.
13. **fix-UX-01-cart-update-quantity** (🟡 Medium)
    *   **Reason**: Minor UX bug for multi-variant products. Low severity.

## Completed Items
These items have been verified as **Done** in the sprint status and support the plan above.

- ✅ **fix-MNY-01-money-units** (Foundational)
- ✅ **fix-SEC-01-client-trust-pricing** (Critical Security)
- ✅ **fix-SEC-02-unsafe-order-endpoint** (Critical Security)
- ✅ **fix-PAY-01-payment-status-model** (Payment Module Alignment)
- ✅ **fix-CHK-01-canonical-checkout** (Core Checkout)
- ✅ **fix-REL-01-idempotency-key** (Reliability)
- ✅ **fix-TAX-01-end-to-end-tax** (Tax Correctness)
- ✅ **fix-RET-01-returns-refunds** (Returns/Refunds Modeling)
