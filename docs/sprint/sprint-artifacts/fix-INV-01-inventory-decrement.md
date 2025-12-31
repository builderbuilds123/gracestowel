# IMPL-INV-01: Inventory decrement is non-atomic

## User Story

**As a** Warehouse Manager,
**I want** inventory to be decremented accurately and atomically,
**So that** we never oversell items that are out of stock.

## Acceptance Criteria

### Scenario 1: Atomic Reservation

**Given** there is only 1 unit of Item A remaining
**When** two customers try to buy Item A simultaneously
**Then** only ONE order should succeed
**And** the other should receive an out-of-stock error (no negative inventory)

### Scenario 2: Correct Location

**Given** multiple stock locations
**When** an order is placed
**Then** inventory should be decremented from the correct location based on the sales channel/shipping rules, not just the first one found

## Technical Implementation Plan (Original)

### Problem

Inventory is decremented by reading `stocked_quantity` and writing back `current - quantity` without locking, allowing overselling.

### Solution Overview

Use atomic database increments or Medusa's inventory service reservation system.

### Implementation Steps

#### 1. Workflow (`apps/backend/src/workflows/create-order-from-stripe.ts`)


- [ ] **Use Inventory Service**: Replace manual DB write with `inventoryService.confirmInventory` or `reserveInventory`.

- [ ] **Atomic Decrement**: If manual update is kept, use `req.em.nativeUpdate(..., { stocked_quantity: () => 'stocked_quantity - ' + quantity })` (MikroORM).

### Verification


- **Automated**:

  - Test: Concurrent order creation (simulate race). verification via `stocked_quantity` check.

### Dependencies


- None.
