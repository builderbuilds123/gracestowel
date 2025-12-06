# Epic 3: Admin Analytics & Dashboarding - Implementation Guide

## Overview
Epic 3 focuses on creating PostHog dashboards and providing admin access. Since Grace Stowel uses **Medusa Admin** (a separate admin application), these stories are primarily completed through the PostHog UI and Medusa Admin configuration.

---

## Story 3.1: Create PostHog Dashboards for Key Metrics

**Status:** Manual PostHog UI Work ⏱️

### Dashboards to Create

#### Dashboard 1: Daily Visitor Analytics
**Purpose:** Track unique visitors per day (Success Criteria: FR4)

**Metric Configuration:**
- **Chart Type:** Time Series Line Chart
- **Event:** `$pageview` (PostHog autocapture)
- **Breakdown:** Unique Users
- **Time Range:** Last 30 days
- **Formula:** Daily Unique Users

**Steps:**
1. Log into PostHog → Dashboards → "+ New Dashboard"
2. Name: "Daily Visitor Analytics"
3. Add Insight → Select "Trends"
4. Configure:
   - Event: `$pageview`
   - Series: Unique users
   - Group by: Day
5. Save to dashboard

---

#### Dashboard 2: Conversion Rate Tracking
**Purpose:** Track conversion rate (Success Criteria: FR5)

**Metrics to Create:**

**A. Daily Conversion Rate**
- **Type:** Funnel
- **Steps:**
  1. `$pageview` (Any page view)
  2. `product_viewed`
  3. `product_added_to_cart`
  4. `checkout_started`
  5. `order_placed`
- **Display:** Conversion % between steps
- **Time filters:** Today, This Week, All Time

**B. Order Conversion Rate (Simplified)**
- **Formula:** `order_placed` events / Unique users
- **Chart Type:** Trends
- **Calculation:** 
  ```
  (Total order_placed events / Total unique users) * 100
  ```

**Steps:**
1. Dashboard → "+ Add Insight"
2. Select "Funnels"
3. Add 5 steps as listed above
4. Set exclusion: None
5. Time range options: Today / This Week / All Time
6. Save to dashboard

---

## Story 3.2: Enable Advanced Filtering and Segmentation

**Status:** ✅ Already Implemented (Code)

### Event Properties Available for Filtering

#### `product_viewed`
- `product_id`
- `product_name`
- `product_price`
- `product_handle`
- `stock_status`

#### `product_added_to_cart`
- `product_id`
- `product_name`
- `product_price`
- `quantity`
- `color`
- `has_embroidery`
- `variant_id`

#### `checkout_started`
- `cart_total`
- `item_count`
- `currency`
- `items` (array with product details)

#### `order_placed`
- `order_id`
- `total`
- `currency`
- `item_count`
- `items` (array with product details)

### Example Segmentation Queries

**High-Value Customers:**
- Filter: `order_placed` where `total > 10000` (cents = $100+)

**Embroidery Popularity:**
- Filter: `product_added_to_cart` where `has_embroidery = true`

**Color Preference:**
- Breakdown: `product_added_to_cart` by `color`

**Cart Abandonment:**
- Funnel: `checkout_started` → **NOT** → `order_placed`

**Manual Testing Steps:**
1. PostHog → Insights → "+ New Insight"
2. Select event (e.g., `product_viewed`)
3. Add filter: Click "+ Filter" → Select property → Set condition
4. Test each example above
5. Verify properties are available and filtering works

---

## Story 3.3: Provide Access to PostHog Dashboards for Admins

**Status:** 📝 Manual Configuration Required

### Option 1: Direct PostHog Access (Recommended for MVP)

**Implementation:**
1. **Invite Admin Users to PostHog:**
   - PostHog Settings → Organization → Members
   - Invite admin email addresses
   - Set role: "Member" (view/edit dashboards)

2. **Share Dashboard Links:**
   - Open Dashboard in PostHog
   - Click "Share" button
   - Copy dashboard URL
   - Provide to admins (e.g., via Slack, email, internal docs)

3. **Create Bookmark:**
   - Add PostHog dashboard URL to admin bookmarks/favorites

**Pros:**
- ✅ Zero code required
- ✅ Fastest implementation
- ✅ Full PostHog features available
- ✅ No maintenance

**Cons:**
- ❌ Requires separate login
- ❌ Not integrated into Medusa Admin UI

---

### Option 2: Embedded PostHog Dashboard (Advanced)

**Implementation:**
If you want to embed dashboards directly into Medusa Admin or a custom admin page:

#### Prerequisites:
- PostHog dashboard sharing enabled
- Custom admin page/route in Medusa Admin or storefront

#### Steps:
1. **Get Shareable Dashboard Link:**
   ```
   PostHog → Dashboard → Share → Enable Public Link → Copy
   ```

2. **Create Admin Analytics Page:**
   Create `apps/storefront/app/routes/admin.analytics.tsx`:
   ```tsx
   export default function AdminAnalytics() {
     // Protect route with authentication
     const { customer, isAuthenticated } = useCustomer();
     
     if (!isAuthenticated || !customer?.email.includes('@yourdomain.com')) {
       return <Navigate to="/" />;
     }

     return (
       <div className="container mx-auto p-8">
         <h1 className="text-3xl font-bold mb-6">Analytics Dashboard</h1>
         
         <iframe
           src="https://app.posthog.com/shared/DASHBOARD_SHARE_TOKEN"
           width="100%"
           height="800px"
           style={{ border: 'none' }}
           title="PostHog Analytics"
         />
       </div>
     );
   }
   ```

3. **Add Navigation Link:**
   Update `Header.tsx` to include admin-only Analytics link:
   ```tsx
   {customer?.email.includes('@yourdomain.com') && (
     <Link to="/admin/analytics">Analytics</Link>
   )}
   ```

**Pros:**
- ✅ Integrated into existing UI
- ✅ Single sign-on (SSO) via customer auth
- ✅ Consistent UX

**Cons:**
- ❌ Requires code changes
- ❌ Limited to shared dashboard features
- ❌ Needs admin role checking

---

## Recommended Approach

For **MVP** (fastest path to completion):
- **Use Option 1**: Direct PostHog Access
- **Completion Time:** 10-15 minutes

For **Production** (best UX):
- **Use Option 2**: Embedded dashboards
- **Completion Time:** 1-2 hours (requires admin role system)

---

## Acceptance Criteria Verification

### ✅ Story 3.1
- [ ] Dashboard shows unique visitors per day (FR4)
- [ ] Dashboard shows conversion rate for today, this week, all time (FR5)
- [ ] Dashboards are visually clear and easy to understand

### ✅ Story 3.2
- [x] Event properties are captured (code verified)
- [ ] Filtering by properties works in PostHog UI
- [ ] Segmentation insights are actionable

### ✅ Story 3.3
- [ ] Admin can access PostHog dashboards via link or embed
- [ ] Access is restricted to authorized admins only
- [ ] Dashboard loads and displays data correctly

---

## Environment Variables Required

**PostHog Project Setup:**
```bash
# Already configured
VITE_POSTHOG_API_KEY=<your_key>
POSTHOG_API_KEY=<your_key>
```

---

## Next Steps

1. **Create PostHog Dashboards** (Story 3.1)
   - Follow instructions above
   - Estimated time: 20-30 minutes

2. **Test Filtering** (Story 3.2)
   - Follow example queries
   - Estimated time: 15 minutes

3. **Set Up Admin Access** (Story 3.3)
   - Choose Option 1 or 2
   - Estimated time: 10 minutes (Option 1) or 1-2 hours (Option 2)

---

## Support Documentation

**PostHog Resources:**
- Dashboard creation: https://posthog.com/docs/product-analytics/dashboards
- Funnels: https://posthog.com/docs/product-analytics/funnels
- Filtering: https://posthog.com/docs/product-analytics/trends

**Created:** 2025-11-28  
**Updated:** 2025-11-28
