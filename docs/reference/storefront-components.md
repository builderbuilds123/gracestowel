# Storefront Components & Hooks

## Overview

The Grace's Towel storefront is a React Router v7 application deployed on Cloudflare Workers. This document covers all custom components, contexts, hooks, and utilities.

## Directory Structure

```
apps/storefront/app/
├── components/       # Reusable React components
├── context/          # React Context providers
├── hooks/            # Custom React hooks
├── routes/           # Page routes and API endpoints
├── data/             # Static data (products, blog)
├── lib/              # Utilities and integrations
└── config/           # Site configuration
```

---

## Components

### Layout Components

#### Header (`Header.tsx`)
Navigation header with logo, cart icon, and menu links.

#### Footer (`Footer.tsx`)
Site footer with links, contact info, and social media.

#### AnnouncementBar (`AnnouncementBar.tsx`)
Promotional banner at the top of the page.

---

### E-commerce Components

#### ProductCard (`ProductCard.tsx`)
Displays a product in grid/list views with image, title, price, and quick actions.

**Props**:
- `product: Product` - Product data object
- `onAddToCart?: () => void` - Callback for add to cart

#### ProductPrice (`ProductPrice.tsx`)
Displays product pricing with sale/original price support.

#### ProductDetailSkeleton (`ProductDetailSkeleton.tsx`)
Loading skeleton for product detail pages.

#### CartDrawer (`CartDrawer.tsx`)
Slide-out cart drawer showing items, quantities, and checkout button.

#### CartProgressBar (`CartProgressBar.tsx`)
Visual progress indicator toward free shipping threshold.

---

### Checkout Components

#### CheckoutForm (`CheckoutForm.tsx`)
Main checkout form integrating Stripe Elements.

**Features**:
- Contact info via `LinkAuthenticationElement`
- Shipping address via `AddressElement`  
- Payment via `PaymentElement`
- Shipping method selection
- Express checkout (Apple Pay, Google Pay)

#### OrderSummary (`OrderSummary.tsx`)
Order summary sidebar showing cart items, subtotal, shipping, and total.

---

### Customization Components

#### EmbroideryCustomizer (`EmbroideryCustomizer.tsx`)
UI for customizing products with embroidered text or drawings.

---

## Contexts

### CartContext (`context/CartContext.tsx`)

Global shopping cart state management.

**State**:
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

**Methods**:
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

**Features**:
- Persists cart to localStorage
- Auto-adds free gift when cart ≥ $35
- Auto-removes free gift when cart < $35

**Usage**:
```tsx
import { useCart } from '../context/CartContext';

function MyComponent() {
  const { items, addToCart, cartTotal } = useCart();
  // ...
}
```

### LocaleContext (`context/LocaleContext.tsx`)

Currency and locale management.

---

## Hooks

### useMedusaProducts (`hooks/useMedusaProducts.ts`)

Fetches products from the Medusa Store API.

**Usage**:
```typescript
import { useMedusaProducts, useMedusaProduct } from '../hooks/useMedusaProducts';

// Fetch all products
const { products, isLoading, error, refetch } = useMedusaProducts();

// Fetch single product by handle
const { product, isLoading, error } = useMedusaProduct(handle);
```

**Helpers**:
```typescript
getFormattedPrice(product, "usd") // "$25.00"
getPriceAmount(product, "usd")    // 25
```

---

## Utilities

### Stripe (`lib/stripe.ts`)

Stripe.js singleton loader.

```typescript
import { getStripe } from '../lib/stripe';
const stripe = await getStripe();
```

### Database (`lib/db.server.ts`)

Server-side PostgreSQL client for Cloudflare Workers.

```typescript
import { getDbClient } from '../lib/db.server';
const client = await getDbClient(context);
```

---

## Configuration

### Site Config (`config/site.ts`)

```typescript
import { SITE_CONFIG } from '../config/site';

SITE_CONFIG.name              // "Grace's Towel"
SITE_CONFIG.freeGiftThreshold // 35
SITE_CONFIG.freeShippingThreshold // 99
```
