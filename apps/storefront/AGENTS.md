# Storefront AGENTS.md — Cloudflare Workers + React Router v7

<!-- Inherits from root AGENTS.md. This file contains storefront-specific guidance. -->

> **Edge Runtime:** This runs on Cloudflare Workers. No Node.js APIs allowed.

---

## Quick Reference

```bash
npm run dev           # Start storefront (localhost:5173)
npm test              # Run Vitest tests
npm run build         # Build for production
npm run deploy        # Deploy to Cloudflare
```

---

## Critical Constraints

### Edge Compatibility

🛑 **NEVER use Node.js APIs:**
- `fs`, `path`, `child_process`, `crypto` (use Web Crypto)
- `Buffer` (use `Uint8Array`)
- `process.env` (use `context.cloudflare.env`)

✅ **Use Web APIs and Cloudflare bindings:**
- `fetch`, `Request`, `Response`
- `context.cloudflare.env.HYPERDRIVE` for database
- `context.cloudflare.env.*` for secrets

### Data Access Pattern

```
READ  ───► Hyperdrive (Direct DB) ───► PostgreSQL
WRITE ───► Medusa REST API ───► Backend ───► DB
```

- **Reads:** Use Hyperdrive for products, categories, search
- **Writes:** Use Medusa SDK for cart, checkout, orders, auth

---

## Directory Structure

```
app/
├── routes/           # File-based pages (React Router v7)
├── components/       # React UI components
├── context/          # React Context (Cart, Locale, Wishlist)
├── hooks/            # Custom React hooks
├── lib/              # Utilities
│   ├── medusa.server.ts   # Medusa SDK
│   ├── db.server.ts       # Hyperdrive access
│   └── stripe.ts          # Stripe client
├── services/         # API service calls
└── config/           # Site configuration
```

---

## React Router v7 Patterns

### Loader (Data Fetching)

```typescript
// app/routes/products.$handle.tsx
import type { Route } from "./+types/products.$handle"
import { getProductByHandle } from "~/lib/products.server"

export async function loader({ params, context }: Route.LoaderArgs) {
  const product = await getProductByHandle(
    params.handle,
    context.cloudflare.env
  )
  if (!product) {
    throw new Response("Not Found", { status: 404 })
  }
  return { product }
}

export default function ProductPage({ loaderData }: Route.ComponentProps) {
  return <ProductDisplay product={loaderData.product} />
}
```

### Action (Form Submissions)

```typescript
export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData()
  const intent = formData.get("intent")
  
  if (intent === "add-to-cart") {
    // Use Medusa SDK for writes
    const medusa = getMedusaClient(context.cloudflare.env)
    await medusa.carts.lineItems.create(cartId, { variant_id, quantity })
  }
  
  return { success: true }
}
```

---

## Hyperdrive Database Access

```typescript
// app/lib/db.server.ts
import postgres from "postgres"

export function getDb(env: Env) {
  const connectionString = env.HYPERDRIVE?.connectionString
    ?? env.DATABASE_URL
    ?? env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE

  return postgres(connectionString, { ssl: false }) // Hyperdrive handles SSL
}

// Usage in loader
export async function loader({ context }: Route.LoaderArgs) {
  const sql = getDb(context.cloudflare.env)
  const products = await sql`
    SELECT * FROM product WHERE status = 'published' LIMIT 20
  `
  return { products }
}
```

---

## Medusa SDK (for Writes)

```typescript
// app/lib/medusa.server.ts
import Medusa from "@medusajs/js-sdk"

export function getMedusaClient(env: Env) {
  return new Medusa({
    baseUrl: env.MEDUSA_BACKEND_URL,
    publishableKey: env.MEDUSA_PUBLISHABLE_KEY,
  })
}
```

---

## Fetch Patterns (Storefront)

Choosing the right fetch utility is critical for security and observability.

| Utility | Use Case | Features |
|---------|----------|----------|
| **`medusaFetch`** | **Medusa Store/Auth API** (`/store/*`, `/auth/*`) | ✅ Auto-injects `x-publishable-api-key`<br>✅ Handles separate `env` for Server vs Client |
| **`monitoredFetch`** | **Internal API Routes** (`/api/*`) | ✅ PostHog Tracing & Analytics<br>❌ DOES NOT inject Medusa keys |
| **`fetch` (Native)** | **Third-Party APIs** (Stripe, Maps, etc.) | ✅ Raw control<br>✅ No tracking headers (Privacy compliant) |

### Usage Examples

**1. Medusa API (Server-Side Loader):**
```typescript
import { medusaFetch } from "~/lib/medusa-fetch"

// Pass `context.cloudflare.env` for server-side key resolution
const response = await medusaFetch("/store/products", {
  method: "GET",
  context
})
```

**2. Medusa API (Client-Side):**
```typescript
// Uses `window.ENV` automatically
const response = await medusaFetch("/store/cart", { method: "POST" })
```

**3. Internal API (Monitoring):**
```typescript
import { monitoredFetch } from "~/utils/monitored-fetch"

// Tracks performance in PostHog
await monitoredFetch("/api/shipping-rates", { ... })
```

**4. External API (Stripe/Other):**
```typescript
// Use native fetch to avoid leaking keys or headers
await fetch("https://api.stripe.com/v1/...", {
  headers: { Authorization: `Bearer ${STRIPE_KEY}` }
})
```

---

## Logging Standards

🛑 **NEVER use `console.log`** in production code.  
✅ **ALWAYS use structured logging.**

In Cloudflare Workers/Storefront, use the provided logger or standard `console.error`/`console.warn` with rigid structure only if a logger isn't available, but prefer:

```typescript
// Good
logger.info("Order created", { order_id: "ord_123", amount: 5000 })

// Bad
console.log("Order created", order_id) 
```

---

## Styling

- **Tailwind CSS v4** — Configuration in CSS, not `tailwind.config.js`
- Use utility classes, avoid custom CSS files
- Follow existing component patterns

---

## Key Files

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | Cloudflare Workers config |
| `vite.config.ts` | Build configuration |
| `react-router.config.ts` | SSR routing |
| `app/lib/db.server.ts` | Hyperdrive access |
| `app/lib/medusa.server.ts` | Medusa SDK |
| `app/context/cart.tsx` | Cart state |

---

## Environment Variables

```bash
# .dev.vars (local development)
MEDUSA_BACKEND_URL="http://localhost:9000"
MEDUSA_PUBLISHABLE_KEY="pk_..."
STRIPE_SECRET_KEY="sk_..."
DATABASE_URL="postgresql://..."

# wrangler.jsonc (production bindings)
# HYPERDRIVE binding configured separately
```

---

## Testing

```bash
npm test              # Run Vitest
npm run test:watch    # Watch mode
```

- Use `happy-dom` environment
- Mock Medusa SDK and Hyperdrive
- Test loaders and components separately

---

## Docs Links

- [React Router v7](https://reactrouter.com/dev/guides)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
- [Medusa JS SDK](https://docs.medusajs.com/v2/resources/js-sdk)
