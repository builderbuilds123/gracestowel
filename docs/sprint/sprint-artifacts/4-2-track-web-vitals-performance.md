# Story 4-2: Track Web Vitals and Performance Metrics

**Epic:** Epic 4 - Production Monitoring & Observability
**Status:** Done
**Prerequisites:** ✅ Story 1.1

---

## User Story

As a developer,
I want to track Core Web Vitals (LCP, FID, CLS) and page load performance,
So that I can monitor and optimize user experience.

---

## Acceptance Criteria

| AC | Given | When | Then |
|----|-------|------|------|
| 1 | A user visits a page on the storefront | The page loads and renders | Web Vitals metrics (LCP, CLS, TTFB) are captured and sent to PostHog |
| 2 | A metric is captured | The event is sent | Each metric includes a "rating" (good, needs-improvement, poor) |

---

## Tasks / Subtasks

- [x] Task 1: Verify Existing Implementation (AC: 1)
  - [x] Confirm `reportWebVitals()` captures LCP, CLS, INP, FCP, TTFB
  - [x] Verify web-vitals library is installed (v5.1.0)
  - [x] Confirm function is called in root.tsx initialization

- [x] Task 2: Add Rating Support (AC: 2)
  - [x] web-vitals v5 automatically includes `rating` property
  - [x] Map metric properties explicitly to PostHog event
  - [x] Include metric_rating in captured events

- [x] Task 3: Add Type Safety
  - [x] Create WebVitalMetric interface
  - [x] Type the callback function parameter

- [x] Task 4: Add Unit Tests
  - [x] Test all Core Web Vitals callbacks registered
  - [x] Test metric_name and metric_value captured
  - [x] Test metric_rating captured (good, needs-improvement, poor)
  - [x] Test URL included in events
  - [x] Test INP (replaces deprecated FID)

---

## Implementation Details

### Metrics Captured

| Metric | Full Name | Description |
|--------|-----------|-------------|
| **LCP** | Largest Contentful Paint | Measures loading performance |
| **CLS** | Cumulative Layout Shift | Measures visual stability |
| **INP** | Interaction to Next Paint | Measures interactivity (replaces FID) |
| **FCP** | First Contentful Paint | Measures initial render |
| **TTFB** | Time to First Byte | Measures server response time |

### Rating Thresholds (from web-vitals)

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP | ≤ 2.5s | > 2.5s, ≤ 4s | > 4s |
| CLS | ≤ 0.1 | > 0.1, ≤ 0.25 | > 0.25 |
| INP | ≤ 200ms | > 200ms, ≤ 500ms | > 500ms |
| FCP | ≤ 1.8s | > 1.8s, ≤ 3s | > 3s |
| TTFB | ≤ 800ms | > 800ms, ≤ 1.8s | > 1.8s |

### PostHog Event Structure

```javascript
posthog.capture('web_vitals', {
  metric_name: 'LCP',           // Core Web Vital name
  metric_value: 2500,           // Metric value (ms or score)
  metric_rating: 'good',        // AC2: good | needs-improvement | poor
  metric_delta: 2500,           // Change since last measurement
  metric_id: 'v1-123',          // Unique metric instance ID
  navigation_type: 'navigate',  // Navigation type
  url: 'https://...',           // Current page URL
});
```

---

## Dev Agent Record

### Context Reference

- `apps/storefront/app/utils/posthog.ts` - Web Vitals implementation
- `apps/storefront/app/root.tsx` - Initialization

### Agent Model Used

Claude Opus 4.5 (via Cursor)

### Completion Notes List

- **Discovery:** `reportWebVitals()` already existed but needed explicit typing and rating documentation
- **Enhancement (2025-12-13):**
  - Added `WebVitalMetric` interface for type safety
  - Changed event name from `$performance_event` to `web_vitals` for clarity
  - Explicit property mapping (metric_name, metric_value, metric_rating)
  - Added development-only debug logging
  - Added comments for each metric

- **Note on FID:** FID (First Input Delay) is deprecated in web-vitals v4+, replaced by INP (Interaction to Next Paint)

- **Tests Added:** 7 new tests covering all ACs and rating scenarios

- **Test Results:** 132 storefront tests pass (0 failures, 0 regressions)

### File List

- `apps/storefront/app/utils/posthog.ts` - **MODIFIED** - Enhanced reportWebVitals(), added types
- `apps/storefront/app/utils/posthog.test.ts` - **MODIFIED** - Added 7 Web Vitals tests
- `docs/sprint/sprint-artifacts/4-2-track-web-vitals-performance.md` - **NEW** - Story file
- `docs/sprint/sprint-artifacts/sprint-status.yaml` - **MODIFIED** - Status updated

### Change Log

- 2025-12-13: Enhanced reportWebVitals() with explicit types, property mapping, and rating capture. Added 7 unit tests. All ACs met.
