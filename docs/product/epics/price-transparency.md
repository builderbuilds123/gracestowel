# Grace Stowel - Transparent Pricing & Impact Epics

**Source PRD:** [transparent-impact.md](../prd/transparent-impact.md)
**Status:** Draft
**Date:** 2025-11-30

---

## Overview

This document breaks down the "Transparent Impact" feature set into 6 deliverable epics. The goal is to implement a dynamic pricing engine that builds trust through radical transparency and integrates direct social impact.

## Epics Summary

1.  **Core Pricing Engine & Admin Configuration** - _Foundation_
2.  **Dynamic Cost Integration Service** - _Backend_
3.  **Real-time Price Calculation & Locking** - _Logic_
4.  **Storefront Transparency Experience** - _Frontend_
5.  **Charity & Impact Integration** - _Post-Purchase_
6.  **Price Lock Guarantee System** - _Retention_

---

## FR Coverage Map

*   **Epic 1:** FR1, FR2
*   **Epic 2:** FR3, FR4, NFR-Caching
*   **Epic 3:** FR5, FR6 (Locking), NFR-Performance
*   **Epic 4:** FR6 (UI), FR7, FR8
*   **Epic 5:** FR9, FR10, FR11, NFR-FailOpen
*   **Epic 6:** FR12, FR13, FR14

---

## Epic 1: Core Pricing Engine & Admin Configuration

**Goal:** Enable administrators to configure the base cost structure and buffers that serve as the foundation for dynamic pricing.

### Story 1.1: Data Modeling for Product Costs
**As a** developer,
**I want** to extend the Product data model to support granular cost components,
**So that** we can store Materials, Labor, Packaging, and Warehousing costs per variant.

*   **AC:**
    *   Database schema updated to include `cost_breakdown` JSONB or related table for Product Variants.
    *   Fields supported: `materials`, `labor`, `packaging`, `warehousing`.
    *   Fields supported for buffers: `returns_buffer_percent`, `fixed_overhead_flat`.
    *   Migration created and applied.

### Story 1.2: Admin UI for Cost Configuration
**As an** admin,
**I want** to input cost data for each product variant in the Medusa Admin,
**So that** the system has the base data needed for calculation.

*   **AC:**
    *   Product Edit page includes a new "Transparent Pricing" section.
    *   Inputs available for all cost components defined in 1.1.
    *   Validation ensures non-negative values.
    *   Data persists correctly to the backend.

---

## Epic 2: Dynamic Cost Integration Service

**Goal:** Build the backend service that aggregates real-time cost data from external infrastructure and marketing APIs.

### Story 2.1: Infrastructure Cost Fetcher (Cloudflare/Railway)
**As a** system,
**I want** to fetch current hosting and compute costs,
**So that** we can amortize them into the product price.

*   **AC:**
    *   Service integrates with Cloudflare API (Bandwidth/Workers) and Railway API (Compute/DB).
    *   Logic implemented to amortize monthly cost down to a "per-order" or "per-session" estimate.
    *   **Caching:** Data is cached in Redis for 60 minutes (NFR).

### Story 2.2: Ad Spend Aggregator (Meta/Google/TikTok)
**As a** system,
**I want** to fetch real-time ad spend from marketing platforms,
**So that** we can calculate the dynamic Customer Acquisition Cost (CAC) component.

*   **AC:**
    *   Service integrates with Meta Marketing API, Google Ads API, and TikTok Ads API.
    *   Aggregates total daily spend.
    *   Calculates `Dynamic Marketing Cost = (Daily Spend / Daily Orders Rolling Avg)`.
    *   **Caching:** Data is cached in Redis for 15 minutes.

### Story 2.3: Payment & SaaS Fee Calculator
**As a** system,
**I want** to calculate payment and software fees,
**So that** these operational costs are covered.

*   **AC:**
    *   Logic to calculate Stripe fees (e.g., 2.9% + 30¢) based on estimated price.
    *   Logic to fetch/config SaaS subscription total and amortize per order.

---

## Epic 3: Real-time Price Calculation & Locking

**Goal:** Synthesize all cost data into a final price and ensure it remains stable for the user's session.

### Story 3.1: Dynamic Price Calculation Logic
**As a** system,
**I want** to calculate the final product price on the fly,
**So that** it reflects the true current cost plus our target margin.

*   **AC:**
    *   Algorithm: `Final Price = (Base Costs + Ops Costs + Infra Costs + Ad Spend + Payment Fees) / (1 - Target Margin %)`.
    *   Calculation happens server-side.
    *   Latency is < 50ms (excluding external fetches, which are cached).

### Story 3.2: Session-Based Price Locking
**As a** customer,
**I want** my price to stay the same while I browse and checkout,
**So that** I don't feel cheated by fluctuating numbers.

*   **AC:**
    *   When a user starts a session (or adds to cart), the calculated price is stamped/locked.
    *   Lock duration: User session or 24 hours.
    *   Cart line items reference the locked price ID/Snapshot.

---

## Epic 4: Storefront Transparency Experience

**Goal:** Visualize the data for the customer to build trust and drive conversion.

### Story 4.1: PDP Price Breakdown Component
**As a** customer,
**I want** to see a visual breakdown of the price on the product page,
**So that** I understand exactly what I'm paying for.

*   **AC:**
    *   Interactive chart (Donut or Waterfall) implemented on PDP.
    *   Segments: Materials, Labor, Transport, Taxes, Corporate (Profit), Impact.
    *   Data flows from the backend pricing engine.
    *   Responsive design for mobile/desktop.

### Story 4.2: Cost Context Tooltips
**As a** customer,
**I want** to click/hover on a cost segment to learn more,
**So that** I understand "Why is marketing 10%?".

*   **AC:**
    *   Tooltips or modal drawer triggered on interaction.
    *   Displays static explanations + dynamic values.

### Story 4.3: Social Impact Visualization
**As a** customer,
**I want** to see the tangible impact of my purchase (e.g., "Buys 1 Tree"),
**So that** I feel good about buying.

*   **AC:**
    *   UI component displays the specific impact (linked to the Charity logic).
    *   Visual emphasis (iconography/color) to highlight the "Good" part of the price.

---

## Epic 5: Charity & Impact Integration

**Goal:** Execute the actual donation and provide proof to the customer.

### Story 5.1: Charity API Integration (Tree Nation & CanadaHelps)
**As a** system,
**I want** to connect to charity providers,
**So that** we can register donations programmatically.

*   **AC:**
    *   Integration with Tree Nation API (Global).
    *   Integration with CanadaHelps API (Canada).
    *   Fail-Open logic: If API is down, log for retry, do not fail checkout.

### Story 5.2: Post-Purchase Async Donation
**As a** system,
**I want** to trigger the donation *after* a successful order,
**So that** we don't block the checkout flow.

*   **AC:**
    *   Event listener for `order.placed`.
    *   Job determines region (Canada vs Global).
    *   Job calls appropriate API to register donation.
    *   Donation reference ID saved to Order metadata.

### Story 5.3: Impact Certificate in Email
**As a** customer,
**I want** to see proof of my donation in my receipt,
**So that** I know it actually happened.

*   **AC:**
    *   Order confirmation email template updated.
    *   Includes section: "Your Impact Certified".
    *   Links to the external certificate/proof if available.

---

## Epic 6: Price Lock Guarantee System

**Goal:** Automate trust by refunding the difference if prices drop.

### Story 6.1: Price Monitoring Job
**As a** system,
**I want** to monitor daily prices against recent orders,
**So that** we can identify eligible refunds.

*   **AC:**
    *   Scheduled job runs daily (cron).
    *   Scans orders from last 30 days.
    *   Compares `Order Price` vs `Current Calculated Price`.

### Story 6.2: Automated Credit Issuance
**As a** system,
**I want** to issue store credit if the price dropped,
**So that** the customer gets the best deal automatically.

*   **AC:**
    *   If `Current < Paid`, calculate difference.
    *   Issue Store Credit to Customer account in Medusa.
    *   Log the adjustment.

### Story 6.3: "Good News" Notification
**As a** customer,
**I want** to be told if I got money back,
**So that** I love this brand forever.

*   **AC:**
    *   Email triggered upon credit issuance.
    *   Subject: "Good news! The price dropped, so we've credited you..."
    *   Clear CTA to use the credit.
