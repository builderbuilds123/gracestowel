# Story: inv-03-backorder-admin-ui

## User Story

As a Warehouse Ops Lead, I want a toggle in the Admin UI for each inventory level so that I can easily enable or disable backorders for specific item/location combinations.

## Acceptance Criteria

### AC1: Admin toggle (inventory level)

- Given an inventory level record in the Admin UI
- When an admin views the inventory details
- Then they can see a toggle for `allow_backorder` (defaulted from the DB)
- And toggling and saving updates the `allow_backorder` column in the `inventory_level` table via a custom API update.

### AC2: Visual Status

- Given an inventory level with negative stock
- When viewed in the toggle list
- Then a "Backordered" status badge or indicator is visible to clearly identify items that are currently negative.

## Technical Notes / Plan

- **Widget**: Create an Admin Widget (`src/admin/widgets/inventory-level-backorder.tsx`) using `@medusajs/admin-sdk`.
- **API**: Implement a custom POST route (`src/api/admin/inventory-levels/[id]/backorder/route.ts`) to update the boolean flag.
- **UI Components**: Use `@medusajs/ui` for consistent look and feel (Switch, StatusBadge, Container).

## Tasks / Subtasks

- [ ] Implement backend API route for updating `allow_backorder` on a specific level.
- [ ] Implement Admin Widget with location-specific toggles.
- [ ] Add unit/integration test for the new API route.
- [ ] Verify UI behavior and DB persistence.
