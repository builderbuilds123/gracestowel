# IMPL-SHP-01: Shipping option selection not persisted

## User Story

**As a** Fulfillment Specialist,
**I want** orders to contain the exact shipping option selected by the customer (e.g., "Express", "Standard"),
**So that** I can purchase the correct shipping label and meet delivery promises.

## Acceptance Criteria

### Scenario 1: Option Persistence

**Given** the customer selects a specific Shipping Option (e.g., "Express") during checkout
**When** the order is created in Medusa
**Then** the Order's Shipping Method should be linked to that specific Shipping Option ID
**And** the price should match the option's configured price (not just a client-side override)

### Scenario 2: Data Integrity

**Given** a shipping option with specific provider data (e.g., Service Code)
**When** the order is processed
**Then** that provider data should be accessible on the Shipping Method for fulfillment processing

## Technical Implementation Plan (Original)

### Problem

Shipping method is sent as a raw amount to Stripe and then synthesized into the order. The actual `shipping_option_id` is lost, breaking fulfillment integrations.

### Solution Overview

Persist `shipping_option_id` on the cart.

### Implementation Steps

#### 1. Storefront (`apps/storefront/app/routes/checkout.tsx`)


- [ ] **Add Shipping Method**: When user selects shipping, call Medusa API `POST /store/carts/:id/shipping-methods` with `option_id`.

- [ ] **Persist in Metadata**: If using Stripe-first flow, store `shipping_option_id` in Stripe metadata.

#### 2. Order Creation (`apps/backend/src/workflows/create-order-from-stripe.ts`)


- [ ] **Use Persisted Option**: Retrieve `shipping_option_id`.

- [ ] **Create Method**: Create the order shipping method using the Option ID and its official price/data, not just the raw amount.

### Verification


- **Automated**:

  - Test: Create order with specific shipping option. Verify `order.shipping_methods[0].shipping_option_id` matches.

### Dependencies


- None.
