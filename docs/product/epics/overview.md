# gracestowel - Epic Breakdown

**Author:** Grace
**Date:** Thursday, November 27, 2025
**Project Level:** (Not explicitly defined in PRD, defaulting to 'Medium')
**Target Scale:** (Not explicitly defined in PRD, defaulting to 'Growth')

---

## Overview

This document provides the complete epic and story breakdown for `gracestowel`, decomposing the requirements from the [PRD](../prds/posthog-analytics.md) into implementable stories.

**Living Document Notice:** This is the initial version. It will be updated after UX Design and Architecture workflows add interaction and technical details to stories.

## Epics Summary

### Epic 1: Foundational Event Tracking
**Goal:** Establish the core infrastructure for capturing essential user interaction data from the storefront.

### Epic 2: Comprehensive Data Capture & User Identification
**Goal:** Ensure all necessary data points are captured and accurately linked to user identities for robust analytics.

### Epic 3: Admin Analytics & Dashboarding
**Goal:** Provide administrators with accessible and insightful PostHog dashboards for key business metrics.

### Epic 4: PostHog Monitoring & Observability
**Goal:** Maximize PostHog's capabilities for comprehensive monitoring (uptime, performance, errors) to support development and production health tracking.

---

## Functional Requirements Inventory

*   FR1: The system must capture key user events on the storefront, including `product_viewed`, `product_added_to_cart`, `checkout_started`, and `order_placed`.
*   FR2: The system must associate tracked events with a unique user identifier to allow for user-level analysis.
*   FR3: The system must capture events from both the client-side (e.g., user interactions on the storefront) and the server-side (e.g., order processing).
*   FR4: The admin must be able to view the number of unique visitors per day in a PostHog dashboard.
*   FR5: The admin must be able to view the conversion rate (orders placed / unique visitors) for today, this week, and historically in a PostHog dashboard.
*   FR6: The admin must be able to filter and segment analytics data in PostHog to gain "real insights" into user behavior.
*   FR7: The admin must be able to access the PostHog dashboards through a link or embedded view within the existing admin application.

---

## FR Coverage Map

*   **Epic 1: Foundational Event Tracking**: FR1, FR3 (client-side part), FR2 (initial event association).
*   **Epic 2: Comprehensive Data Capture & User Identification**: FR2 (refined user identification), FR3 (server-side part).
*   **Epic 3: Admin Analytics & Dashboarding**: FR4, FR5, FR6, FR7.

---

## Epic 0: Architecture & Data Foundation

**Goal:** Transition storefront from static content to dynamic Medusa backend integration using Hyperdrive, establishing the "single source of truth."

### Story 0.1: Establish Medusa Client & Hyperdrive Connection

As a developer,
I want to configure the Medusa JS client and Cloudflare Hyperdrive in the storefront,
So that I can securely and performantly fetch data from the Medusa backend.

**Acceptance Criteria:**
*   **Given** the storefront application is configured.
*   **When** the application attempts to connect to the backend.
*   **Then** the Medusa JS client is initialized with correct environment variables.
*   **And** the Hyperdrive binding is configured in `wrangler.toml` and accessible in loaders.
*   **And** the connection is verified by fetching a simple endpoint (e.g., store details).

**Technical Notes:** Ensure `wrangler.toml` in `apps/storefront` is updated with local and production Hyperdrive bindings.

### Story 0.2: Refactor PDP to Dynamic Data

As a customer,
I want to see real-time product details (price, inventory) on the Product Page,
So that I can make accurate purchasing decisions.

**Acceptance Criteria:**
*   **Given** I am on a Product Detail Page (PDP).
*   **When** the page loads.
*   **Then** the static JSON loader is replaced with `medusa.products.retrieve` call.
*   **And** loading states are handled gracefully.
*   **And** 404s are correctly displayed for missing products.
*   **And** SEO metadata is generated using the dynamic product data.

**Technical Notes:** Update `loader` function in PDP route to use `context.medusa`.

---

## Epic 1: Foundational Event Tracking

Establish the core infrastructure for capturing essential user interaction data from the storefront.

### Story 1.1: Initialize PostHog SDK for Client-Side Tracking

As a developer,
I want to initialize the PostHog SDK in the storefront application,
So that we can start capturing client-side events.

**Acceptance Criteria:**
**Given** the PostHog project API key and host are configured as environment variables.
**When** the storefront application loads.
**Then** the PostHog SDK is initialized and ready to capture events.
**And** the SDK is configured to only be active in production environments.

**Prerequisites:** None.

**Technical Notes:** This story involves adding the PostHog SDK to the `storefront` application. The SDK should be initialized in a central place, like the main application entry point.

### Story 1.2: Track Key User Events on the Storefront

As a developer,
I want to track key user events on the storefront,
So that we can understand user behavior.

**Acceptance Criteria:**
**Given** the PostHog SDK is initialized.
**When** a user views a product page.
**Then** a `product_viewed` event is captured with the product ID and name.
**When** a user adds a product to the cart.
**Then** a `product_added_to_cart` event is captured with the product ID, name, and quantity.
**When** a user starts the checkout process.
**Then** a `checkout_started` event is captured.

**Prerequisites:** Story 1.1.

**Technical Notes:** This involves adding PostHog tracking calls to the relevant React components in the `storefront` application.

### Story 1.3: Associate Events with Anonymous User IDs

As a developer,
I want to associate captured events with an anonymous user ID,
So that we can analyze user journeys.

**Acceptance Criteria:**
**Given** events are being captured.
**When** a user visits the storefront for the first time.
**Then** a unique anonymous ID is generated for the user by PostHog.
**And** all subsequent events from that user are associated with this anonymous ID.

**Prerequisites:** Story 1.1.

**Technical Notes:** PostHog handles anonymous user ID generation and management automatically. This story is to ensure that this default behavior is working as expected and not being overridden.

---

## Epic 2: Comprehensive Data Capture & User Identification

Ensure all necessary data points are captured and accurately linked to user identities for robust analytics.

### Story 2.1: Implement Server-Side Event Tracking for Key Order Events

As a developer,
I want to implement server-side event tracking for key order events,
So that we can reliably capture conversion data.

**Acceptance Criteria:**
**Given** the PostHog SDK is configured on the backend.
**When** an order is successfully placed.
**Then** a server-side `order_placed` event is captured with the order ID, total amount, and currency.
**And** the event is associated with the correct user ID.

**Prerequisites:** None (can be done in parallel with client-side work, but depends on user identification).

**Technical Notes:** This story involves adding the PostHog SDK to the `backend` (Medusa) application. The event should be triggered in the order processing service.

### Story 2.2: Identify and Associate Logged-in Users with Events

As a developer,
I want to identify logged-in users and associate their events with their user ID,
So that we can track their behavior across sessions and devices.

**Acceptance Criteria:**
**Given** a user is logged in.
**When** the user performs a tracked event (e.g., `product_viewed`).
**Then** the event is associated with their unique user ID (e.g., Medusa customer ID) in PostHog.
**And** their anonymous ID is aliased to their user ID to merge their pre-login and post-login activity.

**Prerequisites:** Story 1.3.

**Technical Notes:** This involves using the `posthog.identify()` method when a user logs in. The user's Medusa `customer_id` should be used as the distinct ID.

### Story 2.3: Ensure Correct User ID Association for Server-Side Events

As a developer,
I want to ensure that server-side events are associated with the correct user ID,
So that we have a complete and accurate user journey.

**Acceptance Criteria:**
**Given** a server-side event is tracked (e.g., `order_placed`).
**When** the event is processed.
**Then** the event is associated with the user's distinct ID (Medusa customer ID).

**Prerequisites:** Story 2.1, Story 2.2.

**Technical Notes:** This may require passing the user's distinct ID from the client to the server during the order placement process, or retrieving it from the session on the server.

---

## Epic 3: Admin Analytics & Dashboarding

Provide administrators with accessible and insightful PostHog dashboards for key business metrics.

### Story 3.1: Create PostHog Dashboards for Key Metrics

As an admin,
I want to see key metrics in a PostHog dashboard,
So that I can quickly understand user activity and business performance.

**Acceptance Criteria:**
**Given** the PostHog project has been receiving data.
**When** I access the PostHog dashboard.
**Then** I see a chart displaying the number of unique visitors per day.
**And** I see a chart displaying the conversion rate (orders placed / unique visitors) for today, this week, and historically.

**Prerequisites:** Epic 1, Epic 2.

**Technical Notes:** This involves creating a new dashboard in PostHog and adding "Insights" (charts) to it. This can be done through the PostHog UI.

### Story 3.2: Enable Advanced Filtering and Segmentation

As an admin,
I want to filter and segment analytics data in PostHog,
So that I can gain "real insights" into user behavior.

**Acceptance Criteria:**
**Given** I am viewing a dashboard or insight in PostHog.
**When** I apply a filter (e.g., by user property, event property, date range).
**Then** the data is updated to reflect the filter.
**And** I can save the filtered view as a new insight or add it to a dashboard.

**Prerequisites:** Epic 1, Epic 2.

**Technical Notes:** This is a core feature of PostHog. This story is to ensure that the collected data is structured in a way that allows for meaningful filtering and segmentation (e.g., by providing useful properties with events).

### Story 3.3: Provide Access to PostHog Dashboards for Admins

As an admin,
I want to easily access the PostHog dashboards from the existing admin application,
So that I don't have to remember another URL.

**Acceptance Criteria:**
**Given** I am logged into the admin application.
**When** I navigate to a new "Analytics" section or click a link.
**Then** I am taken to the PostHog dashboard in a new tab or an embedded view.

**Prerequisites:** Story 3.1.

**Technical Notes:** This involves adding a new link or section to the admin application's UI that points to the PostHog dashboard URL. For an embedded view, PostHog's "embedded dashboards" feature would be used.

---

## Epic 4: Production Monitoring & Observability

Implement comprehensive monitoring for uptime, performance, and errors using PostHog to ensure system reliability and rapid issue detection.

### Story 4.1: Implement Error Tracking with PostHog

As a developer,
I want to capture and track JavaScript errors in PostHog,
So that I can quickly identify and debug production issues.

**Acceptance Criteria:**
**Given** the PostHog SDK is initialized in the storefront.
**When** an unhandled error or promise rejection occurs.
**Then** an `$exception` event is captured in PostHog with error type, message, and stack trace.
**And** the error event is linked to the user's session for debugging context.

**Prerequisites:** Story 1.1.

**Technical Notes:** Implement error listeners in `root.tsx` to capture unhandled errors and promise rejections. Send structured error events to PostHog with full context.

### Story 4.2: Track Web Vitals and Performance Metrics

As a developer,
I want to track Core Web Vitals (LCP, FID, CLS) and page load performance,
So that I can monitor and optimize user experience.

**Acceptance Criteria:**
**Given** a user visits a page on the storefront.
**When** the page loads and renders.
**Then** Web Vitals metrics (LCP, FID, CLS, TTFB) are captured and sent to PostHog.
**And** each metric includes a "rating" (good, needs-improvement, poor).

**Prerequisites:** Story 1.1.

**Technical Notes:** Use PerformanceObserver API to capture Web Vitals and send custom events to PostHog. Implement in a dedicated `performance.ts` utility module.

### Story 4.3: Monitor API Latency and Error Rates

As a developer,
I want to track API request latency and error rates,
So that I can identify backend performance issues and API failures.

**Acceptance Criteria:**
**Given** the storefront makes an API request to the backend.
**When** the request completes (success or failure).
**Then** an `api_request` event is captured with URL, method, status, duration, and success/failure.
**And** failed requests capture the error message for debugging.

**Prerequisites:** Story 1.1.

**Technical Notes:** Wrap fetch calls in a monitoring utility (`monitoredFetch`) that tracks timing and outcomes. Send events to PostHog with structured data.

### Story 4.4: Implement Backend Event Tracking for Errors and Performance

As a developer,
I want to track backend errors and key performance events in PostHog,
So that I have visibility into server-side issues.

**Acceptance Criteria:**
**Given** the PostHog Node.js SDK is configured in the Medusa backend.
**When** a backend error occurs or slow query is detected.
**Then** a `backend_error` event is captured with error details and context.
**And** critical business events (e.g., payment failures) are tracked.

**Prerequisites:** Story 2.1 (PostHog backend SDK setup).

**Technical Notes:** Add error handler middleware to capture exceptions. Track slow queries and critical business events as custom PostHog events.

### Story 4.5: Set Up Basic Health Check Monitoring

As a developer,
I want to implement automated health checks that report to PostHog,
So that I can detect system outages quickly.

**Acceptance Criteria:**
**Given** a health check endpoint exists at `/health` on the backend.
**When** the health check runs (every minute via external cron).
**Then** a `health_check` event is sent to PostHog with status (healthy/unhealthy) and response time.
**And** failed health checks include error details.

**Prerequisites:** Story 2.1.

**Technical Notes:** Implement `/health` endpoint that checks database and Redis connectivity. Use GitHub Actions or external service to call endpoint every minute. Report results to PostHog.

### Story 4.6: Create Monitoring and Observability Dashboards

As a developer/admin,
I want to view monitoring dashboards in PostHog for errors, performance, and uptime,
So that I can quickly assess system health.

**Acceptance Criteria:**
**Given** monitoring data is being collected in PostHog.
**When** I access the monitoring dashboards.
**Then** I see dashboards for: System Health (uptime, response times), Performance (Web Vitals trends, API latency), and Errors (error rates, top errors).
**And** each dashboard shows trends over time (24h, 7d, 30d).

**Prerequisites:** Stories 4.1, 4.2, 4.3, 4.5.

**Technical Notes:** Create dedicated PostHog dashboards using Insights. Configure alerts for critical thresholds (e.g., error rate > 5%, uptime < 99%).


---

## Epic 4: PostHog Monitoring & Observability

Maximize PostHog's capabilities for comprehensive monitoring to support development and ensure production health tracking (uptime, performance, errors).

### Story 4.1: Implement Error Tracking with PostHog

As a developer,
I want to automatically capture and track JavaScript errors in PostHog,
So that I can debug issues and monitor error rates without additional tools.

**Acceptance Criteria:**
**Given** the PostHog SDK is initialized in the storefront.
**When** an unhandled JavaScript error occurs.
**Then** an `$exception` event is captured in PostHog with error type, message, and stack trace.
**And** the error is linked to the user's session for debugging.
**When** an unhandled promise rejection occurs.
**Then** an `$exception` event is captured with rejection details.

**Prerequisites:** Story 1.1 (PostHog SDK initialized).

**Technical Notes:** Add global error listeners (`window.addEventListener('error')` and `window.addEventListener('unhandledrejection')`) to capture exceptions and send to PostHog using the `$exception` event type.

### Story 4.2: Track Web Vitals and Performance Metrics

As a developer,
I want to track Core Web Vitals (LCP, FID, CLS) and custom performance metrics,
So that I can monitor and optimize storefront performance.

**Acceptance Criteria:**
**Given** the PostHog SDK is initialized with `capture_performance: true`.
**When** the page loads and Web Vitals are measurable.
**Then** PostHog captures `web_vital_lcp`, `web_vital_fid`, and `web_vital_cls` events with values and ratings.
**When** an API request is made via the monitored fetch wrapper.
**Then** an `api_request` event is captured with URL, method, status, and duration.

**Prerequisites:** Story 1.1.

**Technical Notes:** Use PerformanceObserver API to track LCP, FID, CLS. Create a custom fetch wrapper (`monitoredFetch`) to track API latency and success rates.

### Story 4.3: Implement Backend Event Tracking for Monitoring

As a developer,
I want to track backend errors and key system events in PostHog,
So that I can monitor backend health alongside frontend analytics.

**Acceptance Criteria:**
**Given** the `posthog-node` SDK is configured in the backend.
**When** a backend error occurs (API error, database error, etc.).
**Then** a `backend_error` event is captured with error details, endpoint, and user context.
**When** a health check is performed (`/health` endpoint).
**Then** a `health_check` or `health_check_failed` event is captured with response time and status.

**Prerequisites:** Story 2.1 (PostHog backend SDK configured).

**Technical Notes:** Add error handler middleware to capture backend errors. Implement health check endpoint that reports status to PostHog.

### Story 4.4: Create PostHog Monitoring Dashboards

As an admin/developer,
I want to see system health and performance metrics in PostHog dashboards,
So that I can quickly identify and resolve issues.

**Acceptance Criteria:**
**Given** monitoring events are being captured.
**When** I access the PostHog "System Health" dashboard.
**Then** I see charts for:
- Error rate trend (frontend + backend)
- Web Vitals trends (LCP, FID, CLS)
- API latency (p50, p95, p99)
- Uptime percentage
**And** I can filter by time range and user segments.

**Prerequisites:** Stories 4.1, 4.2, 4.3.

**Technical Notes:** Create a new dashboard in PostHog UI with Insights for each metric. Use Trends for time-series data and Funnels for conversion analysis.

### Story 4.5: Set Up Basic Alerting for Critical Issues

As a developer/admin,
I want to receive notifications when critical errors or outages occur,
So that I can respond quickly to production issues.

**Acceptance Criteria:**
**Given** monitoring dashboards are set up.
**When** the error rate exceeds a threshold (e.g., >10 errors in 5 minutes).
**Then** an alert is sent via webhook to Slack or email.
**When** a health check fails (service is down).
**Then** an immediate alert is sent.

**Prerequisites:** Story 4.4.

**Technical Notes:** Use PostHog webhooks + external service (n8n, Zapier) or custom alerting script querying PostHog API. Alternatively, set up external health check service (UptimeRobot, GitHub Actions cron) that hits `/health` endpoint.

---

## FR Coverage Matrix


*   FR1: Epic 1, Story 1.1, 1.2
*   FR2: Epic 1, Story 1.3; Epic 2, Story 2.2, 2.3
*   FR3: Epic 1, Story 1.2; Epic 2, Story 2.1, 2.3
*   FR4: Epic 3, Story 3.1
*   FR5: Epic 3, Story 3.1
*   FR6: Epic 3, Story 3.2
*   FR7: Epic 3, Story 3.3

---

## Summary

**✅ Epic Breakdown Complete**

**Created:** `epics.md` with epic and story breakdown

**FR Coverage:** All functional requirements from PRD mapped to stories

**Context Incorporated:**

- ✅ PRD requirements
- ✅ Architecture technical decisions

**Status:** COMPLETE - Ready for Phase 4 Implementation!

---

_For implementation: Use the `create-story` workflow to generate individual story implementation plans from this epic breakdown._

_This document will be updated after UX Design and Architecture workflows to incorporate interaction details and technical decisions._
