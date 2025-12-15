# Product Requirement: Grace Stowel Ecommerce V1.0
**Date**: 2025-11-25
**Type**: Architectural Expansion & Feature Set

## 1. Context & Business Value
Grace Stowel aims to be a premium destination for Egyptian cotton towels. While the current "Guest Checkout" flow allows for transactions, to build a brand and increase Customer Lifetime Value (CLV), we must transition from a transactional site to a **Customer-Centric Platform**.

**Primary Goal**: Launch a complete, premium ecommerce experience that supports customer retention.

## 2. Gap Analysis (Current vs. Needed)

| Feature Area | Current State | Required State | Gap / Architectural Enabler |
| :--- | :--- | :--- | :--- |
| **Catalog** | Basic Product/Collection pages | Searchable, filterable catalog | **Search Engine** (MeiliSearch/Algolia) |
| **Checkout** | Guest Checkout (Stripe) | Guest + Authenticated Checkout | **Auth Module** (Storefront Integration) |
| **Customer** | Anonymous (LocalStorage Cart) | Persistent Profiles, Order History | **Customer Accounts** (Medusa Auth) |
| **Content** | Static Shells (About, Blog) | Dynamic Content / CMS | **CMS Integration** (Strapi/Contentful or Medusa Links) |
| **Post-Purchase**| Email Receipt (Stripe) | Order Tracking, Returns Portal | **Order Management UI** |

## 3. Technical Specifications (The Build)

### A. Infrastructure Prerequisites (The "Enablers")
* [ ] **Auth Infrastructure**: Fully implement `@medusajs/auth-emailpass` on the backend and expose via Storefront API.
    * *Ref*: `docs/MEDUSA_AUTH_MODULE_ISSUE.md` (Known issues need resolution).
* [ ] **Search Infrastructure**: Provision MeiliSearch (or similar) on Railway/Cloudflare and configure Medusa indexer.
* [ ] **Email Service**: Configure SendGrid/Resend for transactional emails (Welcome, Order Confirmed, Shipped).

### B. Feature Implementation Plan

#### Phase 1: The Foundation (Current Focus)
* **Goal**: Solidify the "Happy Path" for guest checkout.
* [ ] **Localization**: Complete French translations (Critical for Canadian market).
* [ ] **SEO**: Meta tags, Sitemap, Structured Data (Schema.org).
* [ ] **Performance**: Image optimization and edge caching policies.

#### Phase 2: Customer Retention (High Priority Expansion)
* **Goal**: Turn guests into members.
* [ ] **User Story**: As a user, I want to create an account to save my shipping info.
* [ ] **User Story**: As a user, I want to view my past orders.
* [ ] **Dev Task**: Create `/account`, `/login`, `/register` routes in Remix.
* [ ] **Dev Task**: Implement Medusa Customer Auth flow (JWT management).

#### Phase 3: Discovery & Engagement (Future)
* **Goal**: Increase conversion and AOV.
* [ ] **Search**: Instant search with predictive results.
* [ ] **Reviews**: Product reviews with star ratings.
* [ ] **Wishlist**: Save items for later (requires Auth).

## 4. Acceptance Criteria (V1.0 Release)
1.  **Guest Checkout**: Flawless end-to-end flow (Cart -> Payment -> Success).
2.  **Performance**: Core Web Vitals (LCP < 2.5s) on mobile.
3.  **Localization**: 100% coverage for EN/FR.
4.  **SEO**: Lighthouse SEO score > 90.
5.  **Stability**: No critical errors in Sentry/Logs during checkout.

## 5. Strategic Recommendation
**Immediate Next Step**: Finish **Phase 1** (Localization & Polish) while architecting **Phase 2** (Auth). Do not start Phase 3 until Auth is stable.
