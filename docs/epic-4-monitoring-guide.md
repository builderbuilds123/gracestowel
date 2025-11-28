# Epic 4: PostHog Monitoring & Observability - Implementation Guide

## Overview
Epic 4 focuses on system health, performance monitoring, and error tracking. The code implementation (tracking) is complete. This guide covers the manual setup of dashboards and alerts in PostHog.

---

## Story 4.4: Create PostHog Monitoring Dashboards

**Status:** Manual PostHog UI Work ⏱️

### Dashboards to Create

#### Dashboard 1: System Health & Errors
**Purpose:** Monitor application stability and errors (Success Criteria: FR8)

**Metrics to Create:**

**A. Error Rate (Trends)**
- **Event:** `exception`
- **Breakdown:** `message`
- **Display:** Line chart
- **Goal:** Should be 0 or near 0

**B. Backend Health Checks**
- **Event:** `health_check`
- **Filter:** `status = ok`
- **Display:** Number (Total count)
- **Goal:** Consistent heartbeat

**C. Recent Errors (Table)**
- **Event:** `exception`
- **Columns:** `timestamp`, `message`, `url`, `stack`
- **Display:** Table

**Steps:**
1. PostHog → Dashboards → "+ New Dashboard"
2. Name: "System Health & Errors"
3. Add insights as defined above

---

#### Dashboard 2: Performance & Web Vitals
**Purpose:** Track Core Web Vitals (LCP, CLS, INP) (Success Criteria: FR9)

**Metrics to Create:**

**A. Core Web Vitals (Trends)**
- **Event:** `$performance_event`
- **Filter:** `name = LCP` (and CLS, INP)
- **Y-Axis:** Average `value`
- **Breakdown:** `name`

**B. Page Load Time**
- **Event:** `$pageview`
- **Property:** `$duration` (automatically captured)
- **Display:** Average duration over time

**Steps:**
1. PostHog → Dashboards → "+ New Dashboard"
2. Name: "Performance & Web Vitals"
3. Add insights as defined above

---

## Story 4.5: Set Up Basic Alerting

**Status:** Manual PostHog Configuration ⏱️

### Alerts to Configure

#### Alert 1: Spike in Errors
- **Trigger:** When `exception` count > 10 in 1 hour
- **Action:** Send webhook / email to dev team
- **Setup:**
  1. Go to "System Health" dashboard
  2. Click on "Error Rate" insight
  3. Click "Alerts" (if available in your plan) or use "Toolbar" -> "Subscribe"

#### Alert 2: Health Check Failure (Inverse)
- **Note:** PostHog is better for *event* alerting. for *absence* of events (server down), external uptime monitors (e.g., UptimeRobot, Pingdom) are better.
- **PostHog approach:** Alert if `health_check` count < X in 1 hour (requires advanced alerting)

---

## Acceptance Criteria Verification

### ✅ Story 4.1: Error Tracking
- [x] `exception` events captured in PostHog
- [x] Stack traces and metadata included

### ✅ Story 4.2: Web Vitals
- [x] `$performance_event` captured (LCP, CLS, INP)
- [x] Web Vitals library integrated

### ✅ Story 4.3: Backend Monitoring
- [x] `health_check` events captured from backend
- [x] `/health` endpoint returns 200 OK

### ✅ Story 4.4 & 4.5 (Manual)
- [ ] Dashboards created in PostHog
- [ ] Alerts configured

---

## Next Steps

1. **Create Dashboards** (Story 4.4)
   - Follow instructions above
   - Estimated time: 20 minutes

2. **Configure Alerts** (Story 4.5)
   - Set up basic error rate alerts
   - Estimated time: 10 minutes

**Created:** 2025-11-28
