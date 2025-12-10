# Data Models

## Overview
Grace's Towel uses a PostgreSQL database. The schema is primarily managed by Medusa's core modules, with custom extensions for reviews.

## Core Entities (Medusa)
The system relies on standard Medusa entities. Key tables include:

- **`product`**: Base product information.
- **`product_variant`**: SKUs, prices, options.
- **`order`**: Customer orders.
- **`cart`**: Shopping carts.
- **`customer`**: User accounts.
- **`region`**: Market regions and currency settings.

## Custom Modules

### Review Module (`apps/backend/src/modules/review`)
Custom module for handling product reviews.

#### `Review` (`review.ts`)
Stores individual product reviews.
- **Fields**:
    - `id`: Primary Key.
    - `product_id`: Reference to the product.
    - `customer_id`: Reference to the customer (if logged in).
    - `rating`: Integer (1-5).
    - `content`: Text body of the review.
    - `created_at`: Timestamp.

#### `ReviewHelpfulVote` (`review-helpful-vote.ts`)
Tracks helpfulness votes on reviews.
- **Fields**:
    - `id`: Primary Key.
    - `review_id`: FK to `Review`.
    - `user_id`: ID of the voter (optional/anonymous).
    - `vote_type`: 'helpful' | 'unhelpful'.

## Migrations
Migrations are managed via Medusa's CLI:
```bash
npx medusa db:migrate
```
Custom module migrations are located in `apps/backend/src/modules/review/migrations`.
