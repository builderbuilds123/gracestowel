# Backend Data Models

## Overview

The backend uses Medusa v2's Data Modeling Language (DML) to define custom entities.

## Modules

### Review Module

**Model:** `Review`
**File:** `apps/backend/src/modules/review/models/review.ts`

| Field | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | ID | Yes | - | Primary Key |
| `product_id` | Text | Yes | - | Reference to Product |
| `customer_id` | Text | Yes | - | Reference to Customer (Verified Buyer) |
| `customer_name` | Text | Yes | - | Display name |
| `customer_email` | Text | Yes | - | Email for verification |
| `order_id` | Text | No | - | Reference to Order (Audit trail) |
| `rating` | Number | Yes | - | Rating value (1-5) |
| `title` | Text | Yes | - | Review title |
| `content` | Text | Yes | - | Review body |
| `verified_purchase` | Boolean | Yes | `true` | Always true in this system |
| `status` | Enum | Yes | `pending` | `pending`, `approved`, `rejected` |
| `helpful_count` | Number | Yes | `0` | Number of helpful votes |

**Indexes & Constraints:**
- Index on `product_id`
- Index on `customer_id`
- Index on `status`
- **Unique Constraint:** `customer_id` + `product_id` (One review per customer per product)
