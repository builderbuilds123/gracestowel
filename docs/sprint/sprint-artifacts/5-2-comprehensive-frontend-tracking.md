# Story 5.2: Implement Comprehensive Frontend Event Tracking

Status: Done

## Story

As an admin,
I want to track all user activities on the frontend including API calls, navigation, scroll behavior, and user interactions,
So that I can gain deep insights into user behavior and identify UX issues.

## Background

The PRD "Growth Features" specifies: "Ability to track users' every move on the platform for deeper insights."

Current implementation has:
- ✅ Basic event tracking (product_viewed, checkout_started, etc.)
- ✅ Autocapture for clicks/forms
- ✅ Session recording
- ✅ Web Vitals
- ❌ Consistent API call tracking across all routes
- ❌ Navigation/route change tracking
- ❌ Scroll depth tracking
- ❌ User engagement metrics (time on page, idle detection)

## Acceptance Criteria

### AC1: API Call Tracking
**Given** any API call is made from the storefront
**When** the request completes (success or failure)
**Then** an `api_request` event is captured with:
- `url` (sanitized, no tokens)
- `method` (GET, POST, etc.)
- `status_code`
- `duration_ms`
- `success` (boolean)
- `error_message` (if failed)
- `route` (current page route)

### AC2: Navigation Tracking
**Given** a user navigates between pages
**When** the route changes
**Then** a `navigation` event is captured with:
- `from_path` (previous route)
- `to_path` (new route)
- `navigation_type` (link, back, forward, direct)
- `time_on_previous_page_ms`

### AC3: Scroll Depth Tracking
**Given** a user scrolls on any page
**When** they reach scroll depth milestones (25%, 50%, 75%, 100%)
**Then** a `scroll_depth` event is captured with:
- `depth_percentage`
- `page_path`
- `page_height`
- `time_to_depth_ms`

### AC4: User Engagement Tracking
**Given** a user is on a page
**When** they interact or go idle
**Then** engagement events are captured:
- `page_engagement` on page exit with `engaged_time_ms`, `idle_time_ms`
- Idle detection after 30 seconds of inactivity

### AC5: Form Interaction Tracking
**Given** a user interacts with a form
**When** they focus, blur, or submit form fields
**Then** `form_interaction` events are captured with:
- `form_name` (checkout, search, etc.)
- `field_name` (without sensitive values)
- `interaction_type` (focus, blur, submit, error)

## Tasks / Subtasks

- [x] **Task 1: Enhance monitoredFetch utility**
  - [x] Add route context to all API requests
  - [x] Create wrapper hook `useMonitoredFetch` for React components
  - [x] Ensure all existing fetch calls use monitored version

- [x] **Task 2: Implement Navigation Tracking**
  - [x] Create `useNavigationTracking` hook
  - [x] Track route changes via React Router
  - [x] Calculate time on previous page
  - [x] Integrate in root.tsx

- [x] **Task 3: Implement Scroll Depth Tracking**
  - [x] Create `useScrollTracking` hook
  - [x] Use requestAnimationFrame for efficiency
  - [x] Debounce scroll events
  - [x] Track milestone thresholds

- [x] **Task 4: Implement Engagement Tracking**
  - [x] Create `useEngagementTracking` hook
  - [x] Track mouse/keyboard activity for idle detection
  - [x] Calculate engaged vs idle time
  - [x] Fire event on page unload/navigation

- [x] **Task 5: Implement Form Tracking**
  - [x] Create `useFormTracking` hook
  - [x] Track checkout form interactions
  - [x] Track search form interactions
  - [x] Sanitize to exclude sensitive data (passwords, card numbers)

- [x] **Task 6: Integration & Testing**
  - [x] Add all hooks to root.tsx via AnalyticsTracking component
  - [x] Write unit tests for each tracking hook (17 tests)
  - [x] Verify events appear in PostHog

## Dev Notes

### Privacy & Performance Constraints
- Sanitize URLs (strip tokens/auth/query secrets) before emitting events; never include request/response bodies.
- Do not capture form field values; exclude sensitive fields entirely (password, card, PII).
- Honor `respect_dnt: true`; disable tracking when DNT is enabled.
- Event handler overhead target: <5ms per event on median hardware; avoid blocking UI thread (use rAF/debounce where applicable).
- Emit only minimal payloads; no personal identifiers beyond existing PostHog distinct_id/session.
- Feature-flag rollout: gate new tracking under PostHog flag `frontend-event-tracking` for safe enablement per environment.

### File Structure

### File Structure
```
apps/storefront/app/
├── hooks/
│   ├── useNavigationTracking.ts
│   ├── useScrollTracking.ts
│   ├── useEngagementTracking.ts
│   └── useFormTracking.ts
├── utils/
│   └── monitored-fetch.ts (enhance existing)
└── root.tsx (integrate hooks)
```

### PostHog Event Schema

```typescript
// API Request
{
  event: 'api_request',
  properties: {
    url: string,           // sanitized
    method: string,
    status_code: number,
    duration_ms: number,
    success: boolean,
    error_message?: string,
    route: string
  }
}

// Navigation
{
  event: 'navigation',
  properties: {
    from_path: string,
    to_path: string,
    navigation_type: 'link' | 'back' | 'forward' | 'direct',
    time_on_previous_page_ms: number
  }
}

// Scroll Depth
{
  event: 'scroll_depth',
  properties: {
    depth_percentage: 25 | 50 | 75 | 100,
    page_path: string,
    page_height: number,
    time_to_depth_ms: number
  }
}

// Page Engagement
{
  event: 'page_engagement',
  properties: {
    page_path: string,
    engaged_time_ms: number,
    idle_time_ms: number,
    total_time_ms: number
  }
}

// Form Interaction
{
  event: 'form_interaction',
  properties: {
    form_name: string,
    field_name: string,      // never include values
    interaction_type: 'focus' | 'blur' | 'submit' | 'error',
    error_message?: string   // validation errors only
  }
}
```

### Privacy Considerations
- Never capture form field values (especially passwords, card numbers)
- Sanitize URLs to remove tokens/auth params
- Respect `respect_dnt: true` setting in PostHog config
- Session recording already handles sensitive data masking

### References
- [PostHog PRD](../../../product/prds/posthog-analytics.md) - Growth Features
- [PostHog Epics](../../../product/epics/overview.md) - Epic 4
- [Existing posthog.ts](../../../../apps/storefront/app/utils/posthog.ts)
- [Existing monitored-fetch.ts](../../../../apps/storefront/app/utils/monitored-fetch.ts)

## Dev Agent Record

### Context Reference
- PRD Growth Features: "Track users' every move"
- PostHog already has autocapture and session recording enabled
- monitoredFetch exists but not used consistently

### Completion Notes List
- Story drafted and ready for implementation
- Builds on existing PostHog infrastructure

### File List
- apps/storefront/app/hooks/useNavigationTracking.ts (new)
- apps/storefront/app/hooks/useScrollTracking.ts (new)
- apps/storefront/app/hooks/useEngagementTracking.ts (new)
- apps/storefront/app/hooks/useFormTracking.ts (new)
- apps/storefront/app/utils/monitored-fetch.ts (enhance)
- apps/storefront/app/root.tsx (integrate)
