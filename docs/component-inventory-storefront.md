# Storefront Component Inventory

## Overview

The storefront is built with React Router v7 and uses TailwindCSS for styling. Components are located in `apps/storefront/app/components`.

## Categories

### Layout
Core layout components used across the application.
- **Header**: Main navigation and branding.
- **Footer**: Site footer with links and info.
- **AnnouncementBar**: Top bar for sitewide announcements.

### Product Display
Components for displaying product information and lists.
- **ProductCard**: Summary view of a product in a grid.
- **ProductDetails**: Main product detail container.
- **ProductImageGallery**: Carousel/grid of product images.
- **ProductInfo**: Title, description, and key details.
- **ProductPrice**: Price display with currency formatting.
- **ProductActions**: Add to cart, quantity selection.
- **RelatedProducts**: Recommendations section.
- **ProductFilters**: Sidebar/modal for filtering product lists.
- **ProductDetailSkeleton**: Loading state for product details.

### Cart & Checkout
Components related to the shopping cart and checkout flow.
- **CartDrawer**: Slide-out cart preview.
- **CartProgressBar**: Visual indicator of free shipping threshold.
- **CheckoutForm**: Stripe payment and address entry.
- **OrderSummary**: Line items and totals display.

### Order Management
Self-service tools for customers to manage their orders.
- **CancelOrderDialog**: Modal for cancelling an order (within 1 hour).
- **EditAddressDialog**: Modal for updating shipping address.
- **AddItemsDialog**: Modal for adding items to an existing order.

### Features
Specialized functionality and interactive elements.
- **EmbroideryCustomizer**: Tool for customizing products with embroidery.
- **ReviewForm**: Form for submitting product reviews.
- **ReviewSection**: Display of product reviews and ratings.
- **WishlistButton**: Toggle for adding/removing from wishlist.
- **SearchBar**: Global search input.
- **Map.client**: Client-side map component (Leaflet).
- **CountdownTimer**: Timer for limited-time offers or windows.

### UI Elements
Reusable base UI components.
- **Dropdown**: Generic dropdown menu.
