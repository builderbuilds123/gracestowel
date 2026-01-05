# Data Layer Documentation

## Overview

Grace's Towel uses a hybrid data approach:
- **Static Data**: Product catalog defined in TypeScript files
- **Dynamic Data**: Medusa API for real-time product management
- **Client State**: React Context for cart and locale

---

## Static Product Data

### Location
`apps/storefront/app/data/products.ts`

### Product Interface

```typescript
interface Product {
  id: number;
  handle: string;           // URL-friendly slug
  title: string;
  price: number;            // Numeric price
  formattedPrice: string;   // Display price (e.g., "$35.00")
  description: string;
  images: string[];         // Array of image URLs
  features: string[];       // Bullet point features
  dimensions: string;       // Size specification
  careInstructions: string[];
  colors: string[];         // Available color options
  disableEmbroidery?: boolean; // Disable customization
}
```

### Current Products

| Handle | Title | Price | Colors |
|--------|-------|-------|--------|
| `the-nuzzle` | The Nuzzle (Washcloth) | $18.00 | Cloud White, Sage, Terra Cotta |
| `the-cradle` | The Cradle (Hand Towel) | $25.00 | Cloud White, Charcoal, Navy |
| `the-bearhug` | The Bear Hug (Bath Towel) | $35.00 | Cloud White, Sand, Stone |
| `the-wool-dryer-ball` | 3 Wool Dryer Balls | $18.00 | N/A |

### Usage

```typescript
import { products, productList } from '../data/products';

// Get single product by handle
const product = products['the-bearhug'];

// Get all products as array
const allProducts = productList;
```

---

## Medusa Product Data

### Hook: `useMedusaProducts`

Fetches products from the Medusa Store API.

```typescript
import { useMedusaProducts, useMedusaProduct } from '../hooks/useMedusaProducts';

// All products
const { products, isLoading, error, refetch } = useMedusaProducts();

// Single product by handle
const { product, isLoading, error } = useMedusaProduct('the-bearhug');
```

### Medusa Product Structure

```typescript
interface MedusaProduct {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  images: Array<{ id: string; url: string }>;
  variants: Array<{
    id: string;
    title: string;
    prices: Array<{
      amount: number;        // In cents (e.g., 3500 = $35.00)
      currency_code: string; // "usd", "eur", etc.
    }>;
  }>;
  options: Array<{
    id: string;
    title: string;
    values: Array<{ id: string; value: string }>;
  }>;
}
```

### Price Helpers

```typescript
import { getFormattedPrice, getPriceAmount } from '../hooks/useMedusaProducts';

// Get formatted price string
getFormattedPrice(product, "usd"); // "$35.00"

// Get numeric price
getPriceAmount(product, "usd"); // 35
```

---

## Site Configuration

### Location
`apps/storefront/app/config/site.ts`

### Configuration Object

```typescript
const SITE_CONFIG = {
  name: "Grace's Towel",
  tagline: "Premium Turkish Cotton Towels",
  email: "hello@gracestowel.com",
  phone: "+1 (555) 123-4567",
  social: {
    instagram: "https://instagram.com/gracestowel",
    facebook: "https://facebook.com/gracestowel",
    twitter: "https://twitter.com/gracestowel"
  },
  freeGiftThreshold: 35,
  freeShippingThreshold: 99,
};
```

---

## Cart State

### Location
`apps/storefront/app/context/CartContext.tsx`

### Cart Item Interface

```typescript
interface CartItem {
  id: number;
  title: string;
  price: string;
  originalPrice?: string;
  image: string;
  quantity: number;
  color?: string;
  embroidery?: {
    type: 'text' | 'drawing';
    data: string;
    font?: string;
    color: string;
  };
}
```

### Cart Context API

```typescript
interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  addToCart: (item) => void;
  removeFromCart: (id, color?) => void;
  updateQuantity: (id, quantity) => void;
  toggleCart: () => void;
  clearCart: () => void;
  cartTotal: number;
}
```

### Persistence

Cart data is persisted to `sessionStorage` (migrated from localStorage for security).

### Free Gift Logic

When cart total ≥ $35:
- Automatically adds "3 Wool Dryer Balls" as free gift
- Gift has `price: "FREE"` and `originalPrice: "$18.00"`

When cart total < $35:
- Automatically removes the free gift
