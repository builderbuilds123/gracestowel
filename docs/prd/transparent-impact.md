# Gracestowel - Transparent Impact PRD

**Author:** Grace
**Date:** 2025-11-30
**Version:** 1.0

---

## Executive Summary

This feature set aims to revolutionize the customer relationship by introducing radical transparency and direct social impact. By revealing the true cost breakdown of products and integrating real-time charity donations, Gracestowel transforms from a simple retailer into a partner in ethical consumption.

### What Makes This Special

**Dynamic Transparent Pricing** combined with **Charity API Integration**. Unlike competitors who hide margins, we show exactly where the money goes—materials, labor, logistics, and profit—and allow users to see the immediate positive impact of their purchase (e.g., planting trees).

---

## Project Classification

**Technical Type:** E-commerce Feature (Full Stack)
**Domain:** Retail / Social Impact
**Complexity:** High (Real-time data integration, Pricing Engine)

**Project Type:** Web Application Feature
**Domain Type:** E-commerce
**Complexity Level:** High

### Domain Context

Leverages the existing Headless Commerce architecture (Medusa + React Router). Requires integration with third-party APIs (Tree Nation) and potentially complex backend logic for dynamic pricing.

---

## Success Criteria

- **Increased Conversion via Transparency:** Users who engage with the price breakdown feature demonstrate a statistically higher conversion rate compared to the baseline.
- **Trust Validation:** Qualitative feedback confirms that transparency is a primary driver for purchase decisions.



---

## Product Scope

### MVP - Minimum Viable Product

- **Dynamic Pricing Engine:** Calculates final product price in real-time based on aggregated costs:
    - **Base:** Materials, Labor, Packaging.
    - **Operational:** Shipping, Warehousing, Returns Buffer (%).
    - **Dynamic:** Infrastructure (Cloudflare/Railway), Ad Spend (Meta/Google/TikTok), Payment Fees (Stripe).
    - **Profit:** Target Margin.
- **Infrastructure Cost Integration:** Fetches real-time hosting/compute costs from Cloudflare/Railway APIs to factor into the price.
- **Ad Spend Integration:** Real-time fetching of marketing costs from Meta, Google, and TikTok APIs.
- **Transparent Breakdown UI:** Interactive component on PDP showing the exact cost composition of the current price.
- **Charity Integration:** Automated donation to Tree Nation (Global) or CanadaHelps (Canada) upon purchase.
- **Price Lock Guarantee:** Automatic store credit issuance if the dynamic price drops below the purchase price within 30 days.

### Growth Features (Post-MVP)

- **User-Selected Charities:** Allow users to choose which cause their purchase supports.
- **Historical Price/Impact Tracking:** Show users how their contributions have added up over time.

### Vision (Future)

- **Supply Chain Blockchain:** Immutable ledger of every material cost and labor hour verification.
- **Total Carbon Transparency:** Real-time carbon footprint calculation per product.

---



---



---



---



---

## Functional Requirements

**Pricing & Cost Engine**

- FR1: Admin can configure base cost components per product: **Materials, Labor, Packaging, Warehousing**.
- FR2: Admin can configure percentage-based buffers: **Returns/Refunds Buffer (e.g., 5%), Fixed Overheads**.
- FR3: System fetches dynamic infrastructure usage costs (Cloudflare/Railway) and **SaaS Subscriptions** (amortized).
- FR4: System fetches real-time ad spend (Meta/Google/TikTok) and calculates **Payment Processing Fees** (e.g., Stripe 2.9% + 30¢).
- FR5: System calculates final product price dynamically: `(Sum of All Costs) + (Target Profit Margin)`.
- FR6: System locks the calculated price for the duration of the user's active session/cart to prevent fluctuation during checkout.

**User Interface**

- FR6: Product Detail Page displays a "Transparent Pricing" interactive breakdown (e.g., donut chart or waterfall) showing all cost components.
- FR7: Users can view detailed descriptions for each cost category (e.g., "Why is marketing 10%?").
- FR8: UI displays the specific social impact of the purchase (e.g., "Buys 1 Tree").

**Charity & Impact**

- FR9: System integrates with **Tree Nation** API for global orders and **CanadaHelps** API for Canadian orders.
- FR10: Completed orders trigger an asynchronous donation event based on shipping address.
- FR11: Order confirmation email/page displays the verified impact certificate or confirmation.

**Price Lock Guarantee**

- FR12: System monitors product prices daily against orders from the last 30 days.
- FR13: If current price < purchase price, system automatically issues store credit for the difference.
- FR14: Users receive an automated email notification: "Good news! The price dropped, so we've credited you [Amount]."

---

## Non-Functional Requirements

### Performance

- **Latency:** Cost calculation and breakdown rendering must not degrade PDP load time by more than 100ms.
- **Caching:** All external API cost data (Cloudflare/Railway, Meta/Google/TikTok, Stripe) must be cached (e.g., 15-60 min TTL) to prevent rate limiting and latency.

### Scalability

- **Fail-Open:** If Charity API is unreachable, the checkout must proceed without error; donation retried asynchronously.
- **Price Stability:** Dynamic price updates must be dampened to avoid jarring user experience (e.g., max 1 update per day or session-locked).

---

_This PRD captures the essence of Gracestowel - Transparent Impact - Radical Transparency & Social Impact_

_Created through collaborative discovery between Grace and AI facilitator._
