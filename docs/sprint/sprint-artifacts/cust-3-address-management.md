# Story: Customer Address Management

**Epic**: Customer Experience
**Story ID**: CUST-3-ADDRESS-MANAGEMENT
**Status**: Backlog
**Priority**: High
**Estimated Effort**: 3-5 story points
**Created**: 2026-01-19
**Parent**: [CUST-0: Customer Module Evaluation](cust-0-customer-module-evaluation.md)

---

## Overview

Enable customers to manage their saved addresses from the account page. Currently, addresses are displayed but customers cannot add, edit, or delete them. An `EditAddressDialog` component exists but is only used for order modification - it can be reused for account address management.

---

## User Story

**As a** logged-in customer,
**I want** to manage my saved addresses,
**So that** I can quickly select them during checkout.

---

## Current State

| Component | Status |
|-----------|--------|
| **Address List Display** | ✅ Implemented (read-only) |
| **Add Address** | NOT implemented |
| **Edit Address** | NOT implemented |
| **Delete Address** | NOT implemented |
| **EditAddressDialog Component** | Exists (for orders only) |

**Existing Address Display:** `apps/storefront/app/routes/account.tsx` (Addresses tab)
**Reusable Component:** `apps/storefront/app/components/EditAddressDialog.tsx`

---

## Acceptance Criteria

### AC1: Add Address Button

**Given** a customer is on the addresses tab
**When** they click "Add Address"
**Then** an address form dialog opens

### AC2: Create New Address

**Given** a customer fills out the address form
**When** they click "Save"
**Then** the address is created via `POST /store/customers/me/addresses`
**And** the address list refreshes to show the new address

### AC3: Edit Existing Address

**Given** a customer clicks "Edit" on an address card
**When** the dialog opens
**Then** it's pre-filled with the existing address data
**And** saving updates via `POST /store/customers/me/addresses/{id}`

### AC4: Delete Address

**Given** a customer clicks "Delete" on an address card
**When** they confirm the deletion
**Then** the address is deleted via `DELETE /store/customers/me/addresses/{id}`
**And** the address list refreshes

### AC5: Set Default Address

**Given** a customer has multiple addresses
**When** they click "Set as Default" on an address
**Then** that address is marked as the default shipping address

### AC6: Address Validation

**Given** a customer submits the address form
**When** required fields are missing (first_name, last_name, address_1, city, country_code, postal_code)
**Then** validation errors are shown

### AC7: Empty State

**Given** a customer has no saved addresses
**Then** they see a message "No saved addresses" with an "Add Address" button

---

## Implementation Steps

### Step 1: Refactor EditAddressDialog for Reuse

**File:** `apps/storefront/app/components/EditAddressDialog.tsx`

The existing component is designed for order modification. Refactor to support both use cases:

```typescript
interface EditAddressDialogProps {
  mode: 'order' | 'account';  // NEW: mode selector
  address?: Address;  // Optional for create mode
  open: boolean;
  onClose: () => void;
  onSave: (address: AddressInput) => Promise<void>;
  onDelete?: () => Promise<void>;  // Only for account mode
}
```

---

### Step 2: Create Address Management Hooks

**File:** `apps/storefront/app/hooks/useCustomerAddresses.ts` (NEW)

```typescript
interface UseCustomerAddresses {
  addresses: Address[];
  isLoading: boolean;
  error: string | null;
  createAddress: (data: AddressInput) => Promise<{ success: boolean }>;
  updateAddress: (id: string, data: AddressInput) => Promise<{ success: boolean }>;
  deleteAddress: (id: string) => Promise<{ success: boolean }>;
  setDefaultAddress: (id: string) => Promise<{ success: boolean }>;
  refetch: () => Promise<void>;
}

export function useCustomerAddresses(): UseCustomerAddresses {
  // Implementation using medusaFetch to:
  // GET /store/customers/me/addresses
  // POST /store/customers/me/addresses
  // POST /store/customers/me/addresses/{id}
  // DELETE /store/customers/me/addresses/{id}
}
```

---

### Step 3: Create AddressCard Component

**File:** `apps/storefront/app/components/AddressCard.tsx` (NEW)

```typescript
interface AddressCardProps {
  address: Address;
  isDefault?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}

// Card displaying:
// - Full formatted address
// - "Default" badge if applicable
// - Edit, Delete, Set as Default actions
```

---

### Step 4: Update Account Addresses Tab

**File:** `apps/storefront/app/routes/account.tsx`

Replace current address display with full management UI:

```typescript
function AddressesTab() {
  const { addresses, createAddress, updateAddress, deleteAddress, setDefaultAddress, isLoading } = useCustomerAddresses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  return (
    <div>
      <div className="flex justify-between">
        <h2>Saved Addresses</h2>
        <Button onClick={() => setDialogOpen(true)}>Add Address</Button>
      </div>

      {addresses.length === 0 ? (
        <EmptyState message="No saved addresses" />
      ) : (
        <div className="grid gap-4">
          {addresses.map(address => (
            <AddressCard
              key={address.id}
              address={address}
              isDefault={address.is_default_shipping}
              onEdit={() => { setEditingAddress(address); setDialogOpen(true); }}
              onDelete={() => handleDelete(address.id)}
              onSetDefault={() => setDefaultAddress(address.id)}
            />
          ))}
        </div>
      )}

      <EditAddressDialog
        mode="account"
        open={dialogOpen}
        address={editingAddress}
        onClose={() => { setDialogOpen(false); setEditingAddress(null); }}
        onSave={handleSave}
        onDelete={editingAddress ? () => deleteAddress(editingAddress.id) : undefined}
      />
    </div>
  );
}
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/storefront/app/hooks/useCustomerAddresses.ts` | CREATE |
| `apps/storefront/app/components/AddressCard.tsx` | CREATE |
| `apps/storefront/app/components/EditAddressDialog.tsx` | MODIFY (add mode prop) |
| `apps/storefront/app/routes/account.tsx` | MODIFY (addresses tab) |

---

## API Endpoints

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List Addresses | `/store/customers/me/addresses` | GET |
| Create Address | `/store/customers/me/addresses` | POST |
| Update Address | `/store/customers/me/addresses/{id}` | POST |
| Delete Address | `/store/customers/me/addresses/{id}` | DELETE |

**Create/Update Payload:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "company": "Acme Inc",
  "address_1": "123 Main St",
  "address_2": "Apt 4B",
  "city": "New York",
  "province": "NY",
  "postal_code": "10001",
  "country_code": "us",
  "phone": "+1234567890",
  "is_default_shipping": true
}
```

---

## UI Design

### Addresses Tab
```
┌─────────────────────────────────────────────┐
│ Saved Addresses              [+ Add Address]│
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ John Doe                     [Default]  │ │
│ │ 123 Main St, Apt 4B                     │ │
│ │ New York, NY 10001                      │ │
│ │ United States                           │ │
│ │ +1234567890                             │ │
│ │                                         │ │
│ │ [Edit] [Delete] [Set as Default]        │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Jane Doe                                │ │
│ │ 456 Oak Ave                             │ │
│ │ Los Angeles, CA 90001                   │ │
│ │ United States                           │ │
│ │                                         │ │
│ │ [Edit] [Delete] [Set as Default]        │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Empty State
```
┌─────────────────────────────────────────────┐
│ Saved Addresses                             │
├─────────────────────────────────────────────┤
│                                             │
│            📍 No saved addresses            │
│                                             │
│    Save addresses for faster checkout       │
│                                             │
│              [+ Add Address]                │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Definition of Done

- [ ] useCustomerAddresses hook created
- [ ] AddressCard component created
- [ ] EditAddressDialog supports both modes
- [ ] Add address functionality works
- [ ] Edit address functionality works
- [ ] Delete address with confirmation works
- [ ] Set default address works
- [ ] Empty state shown when no addresses
- [ ] Form validation for required fields
- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] Manual test: Full CRUD flow works

---

## Verification

1. **Add address:** Click Add, fill form, verify created
2. **Edit address:** Click Edit, modify, verify updated
3. **Delete address:** Click Delete, confirm, verify removed
4. **Set default:** Click Set as Default, verify badge moves
5. **Empty state:** Delete all, verify empty message
6. **Build:** `pnpm build` in storefront

---

## References

- [Medusa v2 Manage Addresses Guide](https://docs.medusajs.com/resources/storefront-development/customers/addresses)
- Parent: `docs/sprint/sprint-artifacts/cust-0-customer-module-evaluation.md`
- Existing Component: `apps/storefront/app/components/EditAddressDialog.tsx`

---

#### Created
2026-01-19
