# Story 3.3: Update Order Confirmation Email Template

Status: Done

## Story

As a **developer**,
I want **the order confirmation email template to display the magic link**,
So that **guests can click through to modify their orders**.

## Acceptance Criteria

### AC1: Magic Link Display for Guests

**Given** an order confirmation email is rendered for a guest
**When** the template receives `magicLink` in props
**Then** the email displays a prominent "Modify Your Order" button/link
**And** the button links to the magic link URL
**And** the email includes text: "You have 1 hour to modify your order"

### AC2: No Magic Link for Registered Customers

**Given** an order confirmation email is rendered for a registered customer
**When** the template receives `magicLink: null` or no magicLink
**Then** the "Modify Your Order" button is NOT displayed
**And** the email includes text: "Log in to your account to view your order"

### AC3: Order Summary Display

**Given** any order confirmation email is rendered
**When** the template receives order data
**Then** the email displays:
- Order number (display_id)
- List of items with quantities and prices
- Order total with currency
- Shipping address (if available)

### AC4: Template Renders Without Errors

**Given** the template component
**When** rendered with valid props (guest or registered)
**Then** no React errors occur
**And** the email HTML is valid

## Technical Requirements

### File to Modify

`apps/backend/src/modules/resend/emails/order-placed.tsx`

### Updated Template

```tsx
import * as React from "react"
import { Html, Head, Body, Container, Section, Text, Button, Hr } from "@react-email/components"

interface OrderItem {
  title: string
  quantity: number
  unit_price: number
}

interface OrderPlacedEmailProps {
  orderNumber: string | number
  items: OrderItem[]
  total: number
  currency: string
  magicLink?: string | null
  isGuest?: boolean
}

export default function OrderPlacedEmail({
  orderNumber,
  items,
  total,
  currency,
  magicLink,
  isGuest,
}: OrderPlacedEmailProps) {
  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100) // Assuming cents
  }

  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section>
            <Text style={headingStyle}>Order Confirmed!</Text>
            <Text style={textStyle}>
              Thank you for your order. Your order number is <strong>#{orderNumber}</strong>.
            </Text>
          </Section>

          {/* Magic Link Section - Guests Only */}
          {magicLink && (
            <Section style={magicLinkSectionStyle}>
              <Text style={magicLinkTextStyle}>
                You have <strong>1 hour</strong> to modify your order.
              </Text>
              <Button href={magicLink} style={buttonStyle}>
                Modify Your Order
              </Button>
              <Text style={smallTextStyle}>
                Add items, update quantities, or change your shipping address.
              </Text>
            </Section>
          )}

          {/* Registered Customer Message */}
          {!magicLink && !isGuest && (
            <Section>
              <Text style={textStyle}>
                Log in to your account to view and manage your order.
              </Text>
            </Section>
          )}

          <Hr style={hrStyle} />

          {/* Order Summary */}
          <Section>
            <Text style={subheadingStyle}>Order Summary</Text>
            {items.map((item, index) => (
              <Text key={index} style={itemStyle}>
                {item.title} × {item.quantity} — {formatPrice(item.unit_price * item.quantity)}
              </Text>
            ))}
            <Hr style={hrStyle} />
            <Text style={totalStyle}>
              Total: {formatPrice(total)}
            </Text>
          </Section>

          <Section>
            <Text style={footerStyle}>
              Questions? Reply to this email or contact support.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const bodyStyle = { backgroundColor: "#f6f9fc", fontFamily: "Arial, sans-serif" }
const containerStyle = { margin: "0 auto", padding: "20px", maxWidth: "600px" }
const headingStyle = { fontSize: "24px", fontWeight: "bold", color: "#333" }
const subheadingStyle = { fontSize: "18px", fontWeight: "bold", color: "#333", marginTop: "20px" }
const textStyle = { fontSize: "16px", color: "#555", lineHeight: "1.5" }
const smallTextStyle = { fontSize: "14px", color: "#777" }
const itemStyle = { fontSize: "14px", color: "#555", margin: "8px 0" }
const totalStyle = { fontSize: "18px", fontWeight: "bold", color: "#333" }
const hrStyle = { borderColor: "#e6e6e6", margin: "20px 0" }
const footerStyle = { fontSize: "12px", color: "#999", marginTop: "30px" }

const magicLinkSectionStyle = {
  backgroundColor: "#e8f4fd",
  padding: "20px",
  borderRadius: "8px",
  marginTop: "20px",
  textAlign: "center" as const,
}
const magicLinkTextStyle = { fontSize: "16px", color: "#333", marginBottom: "15px" }
const buttonStyle = {
  backgroundColor: "#007bff",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: "bold",
  display: "inline-block",
}
```

## Tasks / Subtasks

- [ ] Add `magicLink?: string | null` to props interface
- [ ] Add `isGuest?: boolean` to props interface
- [ ] Add conditional magic link section (only when `magicLink` exists)
- [ ] Add "Modify Your Order" button with magic link href
- [ ] Add "1 hour to modify" messaging
- [ ] Add conditional message for registered customers
- [ ] Ensure order summary displays correctly
- [ ] Add basic styling (keep simple for MVP)
- [ ] Test template renders without errors

## Testing Requirements

### Unit Tests

Create `apps/backend/integration-tests/unit/order-placed-email.unit.spec.ts`:

- [ ] Template renders with magic link (guest)
- [ ] Template renders without magic link (registered)
- [ ] Magic link button has correct href
- [ ] Order items display correctly
- [ ] Total displays with correct currency formatting
- [ ] No React errors on render

### Visual Testing

- [ ] Preview email in React Email preview tool
- [ ] Verify magic link button is prominent
- [ ] Verify order summary is readable
- [ ] Test on mobile viewport

### Test Command

```bash
cd apps/backend && npx jest integration-tests/unit/order-placed-email.unit.spec.ts
```

## Definition of Done

- [ ] Template accepts `magicLink` prop (optional)
- [ ] Magic link renders as clickable button when present
- [ ] Magic link section hidden when prop is null/undefined
- [ ] "1 hour to modify" text displayed for guests
- [ ] Order summary displays: order number, items, total
- [ ] Template renders without errors for both guest and registered
- [ ] Visual test: email renders correctly in preview
- [ ] No TypeScript errors

## Dev Notes

### Existing Template

Check the existing `order-placed.tsx` template structure. It may already have:
- Order summary display
- Basic styling
- Other props

Preserve existing functionality while adding magic link support.

### React Email Components

The template uses `@react-email/components`. Available components:
- `Html`, `Head`, `Body` - Document structure
- `Container`, `Section` - Layout
- `Text`, `Button`, `Link` - Content
- `Hr` - Horizontal rule

### Price Formatting

Medusa stores prices in cents (smallest currency unit). The `formatPrice` function divides by 100. Verify this matches your data.

### Email Client Compatibility

Keep styles inline and simple for email client compatibility:
- Use tables for complex layouts (if needed)
- Avoid CSS flexbox/grid
- Test in multiple email clients (Gmail, Outlook, Apple Mail)

## References

- [Magic Link Generation (Story 3.2)](docs/sprint/sprint-artifacts/email-3-2-generate-magic-link-for-guests.md)
- [Existing Email Templates](apps/backend/src/modules/resend/emails/)
- [React Email Docs](https://react.email/docs/introduction)
- [Architecture Doc](docs/product/architecture/transactional-email-architecture.md)

## Dev Agent Record

_To be filled by implementing agent_

### Agent Model Used
_Model name_

### Completion Notes
_Implementation notes_

### File List
| File | Change |
|------|--------|
| `apps/backend/src/modules/resend/emails/order-placed.tsx` | Modified - added magic link |

### Change Log
_Code review follow-ups_
