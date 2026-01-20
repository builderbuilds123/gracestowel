# Story: Edit Customer Profile

**Epic**: Customer Experience
**Story ID**: CUST-2-EDIT-PROFILE
**Status**: Backlog
**Priority**: High
**Estimated Effort**: 2-3 story points
**Created**: 2026-01-19
**Parent**: [CUST-0: Customer Module Evaluation](cust-0-customer-module-evaluation.md)

---

## Overview

Enable customers to edit their profile information (name, phone, company) from the account page. Currently, the profile tab is read-only with no edit functionality.

---

## User Story

**As a** logged-in customer,
**I want** to update my profile information,
**So that** my account details are accurate and up-to-date.

---

## Current State

| Component | Status |
|-----------|--------|
| **Profile Tab** | Read-only display |
| **Edit Form** | NOT implemented |
| **updateProfile Context Method** | NOT implemented |
| **API Integration** | NOT implemented |

**Current Profile Display:** `apps/storefront/app/routes/account.tsx:243-270`

---

## Acceptance Criteria

### AC1: Edit Mode Toggle

**Given** a customer is on the profile tab
**When** they click "Edit Profile" button
**Then** the profile fields become editable inputs

### AC2: Editable Fields

**Given** the profile is in edit mode
**Then** the following fields are editable:

- First Name
- Last Name
- Phone Number
- Company Name (optional)

### AC3: Save Changes

**Given** a customer modifies their profile
**When** they click "Save"
**Then** the changes are sent to `POST /store/customers/me`
**And** the CustomerContext state is updated
**And** a success message is shown

### AC4: Cancel Edit

**Given** the profile is in edit mode
**When** the customer clicks "Cancel"
**Then** changes are discarded
**And** the profile returns to read-only mode

### AC5: Validation

**Given** a customer submits the profile form
**When** first_name or last_name is empty
**Then** an error message is shown
**And** the form is not submitted

### AC6: Loading State

**Given** the profile form is being submitted
**Then** the Save button shows a loading indicator
**And** inputs are disabled

---

## Implementation Steps

### Step 1: Add updateProfile to CustomerContext

**File:** `apps/storefront/app/context/CustomerContext.tsx`

Add new method to update customer profile:

```typescript
interface CustomerContextType {
  // ... existing methods
  updateProfile: (data: UpdateProfileData) => Promise<{ success: boolean; error?: string }>;
}

interface UpdateProfileData {
  first_name?: string;
  last_name?: string;
  phone?: string;
  company_name?: string;
}

const updateProfile = async (data: UpdateProfileData) => {
  try {
    const response = await medusaFetch('/store/customers/me', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (response.ok) {
      const { customer } = await response.json();
      setCustomer(customer);
      return { success: true };
    }

    return { success: false, error: 'Failed to update profile' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
```

---

### Step 2: Create EditProfileForm Component

**File:** `apps/storefront/app/components/EditProfileForm.tsx` (NEW)

```typescript
interface EditProfileFormProps {
  customer: Customer;
  onSave: (data: UpdateProfileData) => Promise<void>;
  onCancel: () => void;
}

// Controlled form with:
// - first_name input (required)
// - last_name input (required)
// - phone input (optional)
// - company_name input (optional)
// - Save and Cancel buttons
```

---

### Step 3: Update Account Profile Tab

**File:** `apps/storefront/app/routes/account.tsx`

Replace the current read-only profile display with:

```typescript
const [isEditing, setIsEditing] = useState(false);

// In Profile tab:
{isEditing ? (
  <EditProfileForm
    customer={customer}
    onSave={handleSaveProfile}
    onCancel={() => setIsEditing(false)}
  />
) : (
  <ProfileDisplay
    customer={customer}
    onEdit={() => setIsEditing(true)}
  />
)}
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/storefront/app/context/CustomerContext.tsx` | ADD updateProfile method |
| `apps/storefront/app/components/EditProfileForm.tsx` | CREATE |
| `apps/storefront/app/routes/account.tsx` | MODIFY profile tab |

---

## API Endpoint

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Update Customer | `/store/customers/me` | POST |

**Request Payload:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890",
  "company_name": "Acme Inc"
}
```

**Response:**
```json
{
  "customer": {
    "id": "cus_xxx",
    "email": "john@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890",
    "company_name": "Acme Inc"
  }
}
```

---

## UI Design

### Read Mode
```
┌─────────────────────────────────────┐
│ Profile                [Edit]       │
├─────────────────────────────────────┤
│ Name: John Doe                      │
│ Email: john@example.com             │
│ Phone: +1234567890                  │
│ Company: Acme Inc                   │
└─────────────────────────────────────┘
```

### Edit Mode
```
┌─────────────────────────────────────┐
│ Edit Profile                        │
├─────────────────────────────────────┤
│ First Name: [John          ]        │
│ Last Name:  [Doe           ]        │
│ Phone:      [+1234567890   ]        │
│ Company:    [Acme Inc      ]        │
│                                     │
│ [Cancel]              [Save]        │
└─────────────────────────────────────┘
```

---

## Definition of Done

- [ ] `updateProfile` method added to CustomerContext
- [ ] EditProfileForm component created
- [ ] Profile tab supports edit mode toggle
- [ ] All editable fields work correctly
- [ ] Validation prevents empty required fields
- [ ] Save button shows loading state
- [ ] Cancel discards changes
- [ ] Success message shown after save
- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] Manual test: Edit and save profile works

---

## Verification

1. **Edit mode:** Click Edit, verify fields become inputs
2. **Save changes:** Modify name, save, verify persisted
3. **Cancel:** Make changes, cancel, verify original values
4. **Validation:** Clear first_name, verify error shown
5. **Build:** `pnpm build` in storefront

---

## References

- [Medusa v2 Edit Profile Guide](https://docs.medusajs.com/resources/storefront-development/customers/profile)
- Parent: `docs/sprint/sprint-artifacts/cust-0-customer-module-evaluation.md`
- Existing Context: `apps/storefront/app/context/CustomerContext.tsx`

---

#### Created
2026-01-19
