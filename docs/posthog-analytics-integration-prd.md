# gracestowel - Product Requirements Document

**Author:** Grace
**Date:** Thursday, November 27, 2025
**Version:** 1.0

---

## Executive Summary

Integrate PostHog into the existing `gracestowel` system to allow analytics for the admin of the app.

### What Makes This Special

The analytics are specifically for the admin, not end-users, providing them with critical insights into user behavior and conversion metrics.

---

## Project Classification

**Technical Type:** web_app
**Domain:** general
**Complexity:** low

This project involves integrating PostHog, a product analytics tool, into the `gracestowel` web application, which has a Medusa v2 backend and a React Router v7 storefront. The primary users of these analytics will be the application's administrators.

---

## Success Criteria

Admin must be able to view the number of unique visitors per day.
Admin must be able to view the conversion rate for today, this week, and historically.

---

## Product Scope

### MVP - Minimum Viable Product

Tracking of key user events: `product_viewed`, `product_added_to_cart`, `checkout_started`, `order_placed`.

### Growth Features (Post-MVP)

Ability to track users' every move on the platform for deeper insights.

### Vision (Future)

To provide comprehensive, granular insights into all user interactions on the platform.

---

## web_app Specific Requirements

*   **Data Capture & Formats**: PostHog should provide an end-to-end data flow from collection to dashboard visualization for admin use.
*   **SDK/Implementation**: Both client-side and server-side capture will be required to track storefront user interactions and order rates, respectively.
*   **Real-time Needs**: There are no real-time data needs.

---

## Functional Requirements

**User & Event Tracking:**

*   FR1: The system must capture key user events on the storefront, including `product_viewed`, `product_added_to_cart`, `checkout_started`, and `order_placed`.
*   FR2: The system must associate tracked events with a unique user identifier to allow for user-level analysis.
*   FR3: The system must capture events from both the client-side (e.g., user interactions on the storefront) and the server-side (e.g., order processing).

**Analytics & Dashboarding:**

*   FR4: The admin must be able to view the number of unique visitors per day in a PostHog dashboard.
*   FR5: The admin must be able to view the conversion rate (orders placed / unique visitors) for today, this week, and historically in a PostHog dashboard.
*   FR6: The admin must be able to filter and segment analytics data in PostHog to gain "real insights" into user behavior.

**Admin Experience:**

*   FR7: The admin must be able to access the PostHog dashboards through a link or embedded view within the existing admin application.

---

## Non-Functional Requirements

### Performance

*   NFR1: Analytics data must be available in the PostHog dashboard within 2 hours of an event occurring.
*   NFR2: The PostHog integration must not introduce any noticeable performance degradation to the storefront or backend.

### Security

*   NFR3: All tracked user data must be pseudonymized or anonymized where possible, respecting user privacy.
*   NFR4: Analytics data must be transmitted securely to PostHog using encrypted channels (e.g., HTTPS).
*   NFR5: Access to sensitive analytics data within PostHog must be restricted based on administrative roles.

### Scalability

*   NFR6: The integration must seamlessly handle anticipated increases in user traffic and event volume without requiring significant architectural changes.

---

_This PRD captures the essence of gracestowel - This PostHog integration will provide administrators of the `gracestowel` platform with essential insights into user behavior, enabling data-driven decisions to optimize the e-commerce experience and drive business growth._

_Created through collaborative discovery between Grace and AI facilitator._
