# INV-02: Allow backorder with intentional negative inventory

**Status:** in-review

## User Story

**As a** Warehouse Ops lead,
**I want** to allow backorders that can drive inventory negative for specific items/locations,
**So that** JIT replenishment can fulfill oversold orders without blocking checkout.

## Acceptance Criteria

### AC1: Opt-in backorder flag
- Given an inventory level (preferred) or item with `allow_backorder=true` set in the DB
- When an order decrements stock
- Then the inventory update proceeds even if the result is negative
- And the negative balance is stored on the same inventory_level row

### AC2: Non-backorder SKUs stay protected
- Given `allow_backorder=false` (default)
- When available stock is insufficient
- Then the workflow throws `InsufficientStockError` and does not decrement

### AC3: Backorder event emission
- Given a decrement that produces `stocked_quantity < 0`
- When the update completes
- Then an `inventory.backordered` event is emitted with variant_id, inventory_item_id, location_id, delta, new_stock

### AC4: Storefront availability masking
- Given a negative inventory level
- When availability is surfaced to the storefront
- Then the displayed available quantity is clamped to 0 (no false positive stock)

### AC5: Tests
- Unit tests cover: (a) allow_backorder=true skips the availability predicate and succeeds; (b) allow_backorder=false blocks with `InsufficientStockError`; (c) backorder event fires when result < 0.

### AC6: Location correctness while backordering
- Given multiple locations and shipping method stock_location_id
- When decrementing with backorder allowed
- Then the chosen location matches the shipping/sales-channel mapping; if unmapped, the workflow fails instead of picking a random warehouse.

### AC7: Non-backorder reservation guard
- Given `allow_backorder=false`
- When available stock at the chosen location is below the requested quantity
- Then the workflow fails with `InsufficientStockError` (or uses reservation) and does not decrement stock
- And reservation/availability checks run before decrement for non-backorder SKUs


## Technical Notes / Plan

- Workflow: in `atomicDecrementInventory`, read `allow_backorder`; only apply `stocked_quantity >= qty` predicate when `allow_backorder=false`. Always use atomic SQL update via manager.knex. For non-backorder paths, enforce reservation/availability before decrement.
- Event: after update, if `stocked_quantity < 0`, emit `inventory.backordered` (subscriber will enqueue replenishment/alert).
- Visibility: add helper to clamp displayed availability to `Math.max(stocked_quantity, 0)` for read paths.
- Tests: expand `apps/backend/integration-tests/unit/atomic-inventory.unit.spec.ts` for AC5 cases.

## Tasks / Subtasks

Done in code (INV-01 fixes, reused here):
- [x] Guard location selection: require shipping/sales-channel location; fail if multiple locations and none provided.
- [x] Add unit tests for preferred location, single location, sales-channel fallback backorder, unmapped failure.

Pending for full backorder feature:
- [x] Update `atomicDecrementInventory` to branch on `allow_backorder` and emit `inventory.backordered` on negative.
- [x] Add storefront/backend availability clamping helper for reads.
- [x] Implement subscriber/worker to handle `inventory.backordered` (alert or enqueue PO).
- [x] Add unit tests for allow_backorder flag and event emission.
- [x] Add unit test asserting non-backorder path rejects insufficient stock (AC7).
- [x] Decide whether to also store `allow_backorder` at inventory_item; document inheritance precedence (item vs level).

## Dev Agent Record

**Files Expected:**
- `apps/backend/src/workflows/create-order-from-stripe.ts`
- `apps/backend/integration-tests/unit/atomic-inventory.unit.spec.ts`
- `apps/backend/src/subscribers/inventory-backordered.ts` (new)
- `apps/backend/src/lib/inventory/availability.ts` (new helper)

**Change Summary (planned):**
- Introduce backorder flag logic, allow negative decrements when opted in, emit backorder event, clamp availability for reads, add tests.
