# Strategic Systems Architecture: Lean Composable Commerce Platform

**Version:** 1.0
**Status:** Approved
**Author:** Strategic Systems Architect
**Target Audience:** Engineering Lead, Coding Agent (Antigravity)

## 1\. Executive Summary

This document serves as the master technical specification for a greenfield B2C e-commerce platform designed for a two-person startup. The architecture prioritizes **developer velocity**, **low operational overhead**, and **scalability**.

The system adopts a **Composable Commerce** approach, decoupling the presentation layer (Remix on Cloudflare) from the commerce engine (Medusa V2 on Railway). This separation enables sub-second global page loads via Edge computing while maintaining a robust, ACID-compliant backend for transaction processing.

### Key Architectural Decisions

  * **Frontend:** Remix Framework running on Cloudflare Workers (Edge).
  * **Backend:** Medusa V2 (Node.js) running on Railway (Containerized).
  * **Database:** PostgreSQL on Railway, accessed via **Cloudflare Hyperdrive** for connection pooling.
  * **Caching/Events:** Redis on Railway.
  * **Observability:** W3C Distributed Tracing connecting Edge interactions to Backend transactions.
  * **Analytics:** Custom "Analytics Module" within Medusa for clickstream and business intelligence, visualized via custom Admin Widgets.

-----

## 2\. System Architecture & Network Topology

The system operates across two primary cloud contexts: The Global Edge (Cloudflare) and the Regional Core (Railway).

### 2.1 High-Level Topology

```mermaid
graph TD
    User -->|HTTPS| CF[Cloudflare Edge Network]
    
    subgraph "Edge Layer (Cloudflare)"
        Worker
        Hyperdrive[Hyperdrive Connection Pool]
        R2
    end
    
    subgraph "Core Layer (Railway - US East)"
        LB
        MedusaServer
        MedusaWorker
        Postgres
        Redis
    end
    
    User -->|Requests| Worker
    Worker -->|Static Assets| R2
    Worker -->|Auth/Write API (Proxy)| LB --> MedusaServer
    Worker -->|Read API (Accelerated)| Hyperdrive --> Postgres
    
    MedusaServer -->|Read/Write| Postgres
    MedusaServer -->|Events| Redis
    MedusaWorker -->|Consume Jobs| Redis
    MedusaWorker -->|Write| Postgres
```

### 2.2 Critical Data Flows

1.  **Storefront Read (Fast Path):** Remix loaders query Product/Content data.
      * *Path:* Worker -\> Hyperdrive -\> Postgres.
      * *Latency:* \<50ms (Cached read) / \<200ms (Uncached).
2.  **Storefront Write (Transactional):** Add to cart, Checkout.
      * *Path:* Worker -\> Remix Proxy -\> Medusa API -\> Postgres.
      * *Constraint:* Must proxy through Remix to handle `HttpOnly` cookies correctly across domains.
3.  **Analytics Ingestion (Async):**
      * *Path:* User Interaction -\> Remix (Trace Injection) -\> Medusa API (Ingest) -\> Postgres (Analytics Table).

-----

## 3\. Infrastructure Specification

### 3.1 Cloudflare (Edge)

  * **Service:** Cloudflare Workers.
  * **Runtime:** V8 Isolate (Node.js compatibility mode: `nodejs_compat`).
  * **Connection Pooling:** **Hyperdrive** is mandatory.
      * *Configuration:* Must bind to the Railway Postgres public connection string.
      * *Reasoning:* Prevents "max\_connection" exhaustion on Postgres during traffic spikes and reduces TLS handshake latency.
  * **Asset Storage:** Cloudflare R2 for product images (zero egress fees).

### 3.2 Railway (Core)

  * **Service Grouping:** Single Project, Private Network Mesh.
  * **Services:**
    1.  **PostgreSQL:** Standard implementation.
    2.  **Redis:** Standard implementation (eviction policy: `volatile-lru`).
    3.  **Medusa Server:** Docker container. Command: `medusa start`. Focus: HTTP API.
    4.  **Medusa Worker:** Docker container. Command: `medusa start` with `MEDUSA_WORKER_MODE=worker`. Focus: Cron jobs, Workflow steps.

-----

## 4\. Backend Specification: Medusa V2

Medusa V2 utilizes a modular architecture. We will implement two custom modules alongside the core commerce modules.

### 4.1 Custom Module: Purchase Order (PO)

**Goal:** Manage inbound stock without full ERP bloat.

  * **Directory:** `src/modules/purchase-order`
  * **Data Models (MikroORM):**
      * `PurchaseOrder`: `id`, `supplier_name`, `status` (draft, placed, received), `location_id`.
      * `PurchaseOrderLineItem`: `id`, `purchase_order_id`, `variant_id` (soft link), `quantity_ordered`, `quantity_received`.
  * **Workflows:**
      * `createPurchaseOrderWorkflow`: Validates input, creates draft PO.
      * `receivePurchaseOrderWorkflow`:
          * Step 1: Update `PurchaseOrderLineItem` received counts.
          * Step 2 (Transactional): Call **Inventory Module** `adjustInventory` to increment stock levels at `location_id`.
          * Step 3: Update PO status to `received`.
          * *Compensation:* Revert inventory adjustment if status update fails.

### 4.2 Custom Module: Analytics

**Goal:** Ingest and query user event data.

  * **Directory:** `src/modules/analytics`
  * **Data Models:**
      * `AnalyticsEvent`:
          * `id` (Primary Key)
          * `trace_id` (Indexed, from W3C header)
          * `event_name` (e.g., "view\_item", "add\_to\_cart")
          * `actor_id` (Customer ID or Session ID)
          * `metadata` (JSONB: holds price, SKU, page URL)
          * `created_at` (Timestamp, Indexed for range queries)
  * **Service Methods:**
      * `recordEvent(data)`: Async insert.
      * `getDailyMetrics(startDate, endDate)`: Raw SQL aggregation query for dashboarding.

-----

## 5\. Frontend Specification: Remix

### 5.1 Authentication Proxy Pattern

To solve cross-site cookie issues (Safari ITP):

1.  **Route:** `app/routes/api/$.tsx` (Splats route).
2.  **Logic:**
      * Intercept requests to `/api/*`.
      * Rewrite target URL to `MEDUSA_BACKEND_URL`.
      * Forward request with original headers.
      * Intercept response.
      * **Rewrite `Set-Cookie` header:** Remove `Domain` attribute or set to `.yourdomain.com` to make it a First-Party cookie.

### 5.2 Observability Injection

Middleware must run on every request (in `entry.server.tsx` or root loader):

1.  Check for incoming `traceparent` header.
2.  If missing, generate new `trace_id` using `crypto.randomUUID()`.
3.  Append `traceparent` header to **all** outgoing `fetch` calls to Medusa.
4.  Log `trace_id` + `request.cf.country` + `request.url` to Cloudflare Logs (or console).

-----

## 6\. Dashboard & Visualization (Admin Extensions)

### 6.1 Configuration Fix for Recharts

Medusa Admin uses Vite. Recharts (charting library) has CommonJS dependencies that break Vite builds.
**File:** `medusa-config.ts`

```typescript
admin: {
  vite: (config) => ({
   ...config,
    ssr: { noExternal: ["recharts", "d3-shape", "d3-path", "d3-scale"] },
    optimizeDeps: { include: ["recharts", "d3-shape"] }
  })
}
```

### 6.2 UI Route: Analytics Dashboard

  * **Location:** `src/admin/routes/analytics/page.tsx`
  * **Config:** `defineRouteConfig({ label: "Analytics", icon: ChartBar })`
  * **Logic:** Use `useQuery` to fetch aggregated data from a custom API endpoint (`/admin/analytics/stats`) which calls the Analytics Module.
  * **Visualization:** Render data using `<BarChart />` and `<LineChart />` from Recharts wrapped in Medusa UI containers.

-----

## 7\. Risk Assessment & Mitigation (FMEA)

| Risk Scenario | Impact | Probability | Technical Mitigation |
+| :--- | :--- | :--- | :--- |
| **DB Connection Exhaustion** | Site outage (500 Errors) | High | **Hyperdrive** enforcement. All Remix loaders MUST use `context.env.HYPERDRIVE.connectionString`. |
| **Cookie Blocking (Safari)** | Broken Checkout/Login | High | **Proxy Pattern**. Storefront never calls Backend directly from client-side JS; all auth traffic goes through Remix server proxy. |
| **Analytics Write Load** | Slow Checkout | Medium | **Module Isolation**. Analytics writes should eventually be moved to a Redis Queue (BullMQ) processed by the Worker, not the main Server. For MVP, use `202 Accepted` response and fire-and-forget. |
| **Inventory Drift** | Overselling | Low | **Workflow Engine**. Use Medusa's Workflow Engine for PO Receiving to ensure `InventoryService` and `PurchaseOrderService` updates are atomic (sagas). |

-----

## 8\. Implementation Checklist for Antigravity

1.  **Project Scaffolding:**
      * Initialize Medusa V2 project (Monorepo structure recommended).
      * Initialize Remix project with Cloudflare Workers adapter.
2.  **Infrastructure Config:**
      * Create `railway.toml` defining `medusa-server` and `medusa-worker` services.
      * Create `wrangler.toml` defining Hyperdrive bindings.
3.  **Core Logic Implementation:**
      * Scaffold `purchase-order` module (Models + Service).
      * Implement `receive-purchase-order` workflow.
      * Scaffold `analytics` module (Model + Service).
4.  **Frontend Integration:**
      * Implement `medusaClient` utility with Hyperdrive support.
      * Implement `proxy` route for Auth.
      * Implement Trace Context middleware.
5.  **Admin Dashboard:**
      * Configure Vite for Recharts.
      * Build Analytics Widget using Medusa UI + Recharts.

This document is the authoritative reference for the system implementation. Any deviations must be updated here first.