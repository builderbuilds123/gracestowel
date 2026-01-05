# Backend API Reference

## Overview

The Grace's Towel backend is built on **Medusa v2**, a headless commerce engine. This document covers:

1. Custom API routes
2. Medusa's built-in Store/Admin APIs
3. Module services
4. Workflow system

## API Routes

### File-based Routing

Routes are defined in `apps/backend/src/api/` using file-system routing:

```
src/api/
├── health/route.ts          → GET /health
├── store/custom/route.ts    → GET/POST /store/custom
└── admin/custom/route.ts    → GET /admin/custom
```

### Custom Endpoints

#### Health Check
```
GET /health
```

**Purpose**: Railway deployment monitoring and health checks.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "medusa-backend"
}
```

**Source**: `apps/backend/src/api/health/route.ts`

#### Store Custom Endpoint
```
GET /store/custom
```

**Purpose**: Placeholder for custom store-facing APIs.

**Response**: `200 OK`

**Source**: `apps/backend/src/api/store/custom/route.ts`

#### Admin Custom Endpoint
```
GET /admin/custom
```

**Purpose**: Placeholder for custom admin APIs.

**Response**: `200 OK`

**Source**: `apps/backend/src/api/admin/custom/route.ts`

## Medusa Built-in APIs

### Store API (Public)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/store/products` | GET | List all products |
| `/store/products?handle={handle}` | GET | Get product by handle |
| `/store/carts` | POST | Create a cart |
| `/store/carts/{id}` | GET | Get cart |
| `/store/carts/{id}/line-items` | POST | Add item to cart |
| `/store/regions` | GET | List available regions |
| `/store/collections` | GET | List product collections |

### Admin API (Authenticated)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/products` | GET/POST | Manage products |
| `/admin/orders` | GET | List orders |
| `/admin/customers` | GET | List customers |
| `/admin/users` | GET/POST | Manage admin users |

> Full Medusa API docs: https://docs.medusajs.com/api/store

## Creating Custom API Routes

### Basic Route

```typescript
// src/api/store/hello/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ message: "Hello from custom route!" });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { name } = req.body;
  res.json({ message: `Hello, ${name}!` });
}
```

### Route with Path Parameters

```typescript
// src/api/store/products/[productId]/route.ts
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { productId } = req.params;
  // Use productId...
}
```

### Accessing Medusa Services

```typescript
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // Access the product module service
  const productService = req.scope.resolve("product");
  
  const [products, count] = await productService.listAndCount();
  
  res.json({ products, count });
}
```

## Modules

Medusa v2 uses a modular architecture. Custom modules go in `src/modules/`:

```
src/modules/
├── README.md           # Module development guide
└── {module-name}/
    ├── index.ts        # Module registration
    ├── service.ts      # Business logic
    └── models/         # Database models
```

### Creating a Module

See `apps/backend/src/modules/README.md` for detailed instructions.

## Workflows

Workflows orchestrate multi-step business logic with automatic rollback support:

```typescript
// src/workflows/my-workflow.ts
import { createStep, createWorkflow, StepResponse } from "@medusajs/framework/workflows-sdk";

const step1 = createStep("validate-input", async (input) => {
  // Validation logic
  return new StepResponse({ validated: true });
});

const myWorkflow = createWorkflow("my-workflow", (input) => {
  const result = step1(input);
  return result;
});

export default myWorkflow;
```

### Executing Workflows

```typescript
// In an API route
import myWorkflow from "../../../workflows/my-workflow";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { result } = await myWorkflow(req.scope).run({
    input: req.body
  });
  res.json(result);
}
```

## Subscribers

Event subscribers react to Medusa events:

```typescript
// src/subscribers/order-placed.ts
import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework";

export default async function orderPlacedHandler({ 
  event, 
  container 
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id;
  // Handle order placed event
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
```

## Authentication

### Admin Authentication

Admin routes require authentication via JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

### CORS Configuration

Configured in `medusa-config.ts`:

```typescript
http: {
  storeCors: process.env.STORE_CORS,   // Allowed storefront origins
  adminCors: process.env.ADMIN_CORS,   // Allowed admin panel origins
  authCors: process.env.AUTH_CORS,     // Allowed auth origins
}
```

## Error Handling

Medusa uses standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 500 | Internal Server Error |
