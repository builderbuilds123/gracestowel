# Storefront API Routes

## Overview

The storefront includes server-side API routes that run on Cloudflare Workers. These handle Stripe integration and other server-side logic.

## Route Convention

API routes are defined in `apps/storefront/app/routes/` with the `api.` prefix:

```
routes/
├── api.payment-intent.ts     → POST /api/payment-intent
├── api.checkout-session.ts   → POST /api/checkout-session
└── api.shipping-rates.ts     → POST /api/shipping-rates
```

---

## API Endpoints

### Payment Intent

**Endpoint**: `POST /api/payment-intent`

**Purpose**: Creates a Stripe PaymentIntent for the checkout process.

**Request Body**:
```json
{
  "amount": 75.00,
  "currency": "usd",
  "shipping": 8.99
}
```

**Response**:
```json
{
  "clientSecret": "pi_3xxx_secret_xxx"
}
```

**Implementation Details**:
- Converts amount to cents for Stripe
- Configures automatic payment methods
- Sets up ACH and ACSS debit options
- Handles US Bank Account (Financial Connections)

**Error Handling**:
```json
{
  "message": "Error creating payment intent: [error details]"
}
```

---

### Checkout Session

**Endpoint**: `POST /api/checkout-session`

**Purpose**: Creates a Stripe Checkout Session for embedded checkout.

**Request Body**:
```json
{
  "amount": 75.00,
  "currency": "usd",
  "items": [
    {
      "title": "The Bear Hug",
      "price": "$35.00",
      "quantity": 2,
      "image": "/bath-towel-bearhug.jpg"
    }
  ]
}
```

**Response**:
```json
{
  "clientSecret": "cs_xxx_secret_xxx"
}
```

**Features**:
- Embedded UI mode
- Line items with product images
- Automatic return URL generation

---

### Shipping Rates

**Endpoint**: `POST /api/shipping-rates`

**Purpose**: Fetches available shipping options from Stripe with dynamic pricing.

**Request Body**:
```json
{
  "subtotal": 75.00
}
```

**Response**:
```json
{
  "shippingOptions": [
    {
      "id": "shr_xxx",
      "displayName": "Priority Shipping",
      "amount": 8.99,
      "originalAmount": 8.99,
      "deliveryEstimate": "2-4 days",
      "isFree": false
    },
    {
      "id": "shr_yyy",
      "displayName": "Ground Shipping",
      "amount": 0,
      "originalAmount": 5.99,
      "deliveryEstimate": "7-10 days",
      "isFree": true
    }
  ]
}
```

**Business Logic**:

| Condition | Ground Shipping Price |
|-----------|----------------------|
| Subtotal < $99 | $5.99 |
| Subtotal ≥ $99 | FREE |

**Stripe Shipping Rate IDs**:
```typescript
const SHIPPING_RATES = [
  "shr_1SW9u3PAvLfNBsYSFIx10mCw",  // Priority
  "shr_1SW9vmPAvLfNBsYSBqUtUEk0"   // Ground (free at $99+)
];
```

---

## Creating New API Routes

### Basic Structure

```typescript
// routes/api.my-endpoint.ts
import { type ActionFunctionArgs, data } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  // Only allow POST
  if (request.method !== "POST") {
    return data({ message: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    
    // Your logic here...
    
    return { success: true, data: result };
  } catch (error) {
    console.error("Error:", error);
    return data({ message: "Internal error" }, { status: 500 });
  }
}
```

### Calling API Routes

**From React Components**:
```typescript
const response = await fetch("/api/my-endpoint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key: "value" })
});

const data = await response.json();
```

**From Loaders/Actions** (same process, server-side):
```typescript
export async function loader({ request }: LoaderFunctionArgs) {
  const response = await fetch(`${new URL(request.url).origin}/api/my-endpoint`, {
    method: "POST",
    body: JSON.stringify({ key: "value" })
  });
  return response.json();
}
```

---

## Environment Variables

API routes have access to environment variables:

**Development** (`.dev.vars`):
```
STRIPE_SECRET_KEY=sk_test_xxx
DATABASE_URL=postgresql://...
```

**Production** (Cloudflare Dashboard):
```bash
wrangler secret put STRIPE_SECRET_KEY
```

**Accessing in Code**:
```typescript
const apiKey = process.env.STRIPE_SECRET_KEY;
```

---

## Security Considerations

1. **Never expose secret keys** in client-side code
2. **Validate all input** before processing
3. **Use HTTPS** for all external API calls
4. **Rate limiting** - Consider adding for production
5. **Error messages** - Don't expose internal details to clients

