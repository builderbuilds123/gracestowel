# Backend API Contracts

## Overview

The backend uses Medusa v2's API routes and workflows. It exposes:
- **Store API**: For customer-facing storefront operations.
- **Admin API**: For back-office operations.
- **Webhooks**: For external integrations (Stripe).

## Store API

Base URL: `/store`

### Orders
- **Path**: `/store/orders`
- **Endpoints**:
    - `POST /store/orders`: Create order (standard)
    - `GET /store/orders/:id`: Get order details
    - `POST /store/orders/by-payment-intent`: Create order specifically from Stripe Payment Intent (Custom Workflow)

### Products
- **Path**: `/store/products`
- **Endpoints**:
    - `GET /store/products`: List products
    - `GET /store/products/:id`: Get product details

### Reviews
- **Path**: `/store/reviews`
- **Endpoints**:
    - `GET /store/reviews`: List reviews
    - `POST /store/reviews`: Create review
    - `GET /store/reviews/:reviewId`: Get review details

### Custom
- **Path**: `/store/custom`
- **Endpoints**:
    - Custom endpoints for specific business logic.

## Admin API

Base URL: `/admin`

### Reviews
- **Path**: `/admin/reviews`
- **Endpoints**:
    - `GET /admin/reviews`: List all reviews (moderation)
    - `POST /admin/reviews/:id/approve`: Approve review
    - `DELETE /admin/reviews/:id`: Delete review

### Custom
- **Path**: `/admin/custom`
- **Endpoints**:
    - Custom admin extensions.

## Webhooks

### Stripe
- **Path**: `/webhooks/stripe`
- **Method**: `POST`
- **Description**: Handles Stripe webhook events (e.g., `payment_intent.succeeded`).
- **Middleware**: Uses `preserveRawBody` to ensure signature verification works.

## Key Workflows

### Create Order from Stripe
- **File**: `apps/backend/src/workflows/create-order-from-stripe.ts`
- **ID**: `create-order-from-stripe`
- **Description**: Orchestrates order creation from a Stripe Payment Intent.
- **Steps**:
    1.  **Prepare Data**: Validates input and maps Stripe metadata to Medusa order format.
    2.  **Create Order**: Uses Medusa's core `createOrdersWorkflow`.
    3.  **Adjust Inventory**: Decrements stock for purchased items.
    4.  **Generate Token**: Creates a modification token for the 1-hour edit window.
    5.  **Log & Emit**: Logs success and emits `order.placed` event.
