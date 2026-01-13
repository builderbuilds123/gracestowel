# Epic: User Feedback Collection System

**Author:** AI Agent
**Date:** 2026-01-13
**Status:** Implemented ✅
**Epic ID:** FEEDBACK-01

---

## Executive Summary

Implement a comprehensive user feedback collection system that captures satisfaction ratings, qualitative feedback, and rich contextual data to drive product improvements and measure customer experience.

---

## Business Context

### Problem Statement

Currently, Grace's Towel has no mechanism to systematically collect user feedback about their shopping experience. Without direct customer input, we cannot:
- Identify friction points in the customer journey
- Measure customer satisfaction at key touchpoints
- Prioritize feature development based on user needs
- Track improvements over time with standardized metrics

### Business Value

| Metric | Expected Impact |
|--------|-----------------|
| Customer Retention | +5-10% by identifying and fixing friction points |
| Conversion Rate | +2-5% by optimizing high-friction pages |
| NPS Score | Establish baseline, target 50+ within 6 months |
| Support Tickets | -15% by proactively fixing reported issues |

### Success Metrics

1. **Response Rate**: Target 3-5% of visitors providing feedback
2. **Completion Rate**: 80%+ of started surveys completed
3. **Actionable Insights**: Monthly report with top 5 improvement areas
4. **NPS Tracking**: Quarterly NPS score measurement

---

## Industry Research Summary

### Best Practices (Sources: Userpilot, ZonkaFeedback, SurveySparrow, Delighted)

1. **Use Multiple Metrics** - Industry recommends combining:
   - **NPS (Net Promoter Score)**: 0-10 scale for loyalty/recommendation
   - **CSAT (Customer Satisfaction)**: 1-5 scale for transactional satisfaction
   - **CES (Customer Effort Score)**: 1-7 scale for friction detection

2. **Timing & Context**
   - Trigger at contextually relevant moments (post-purchase, exit intent)
   - Avoid interrupting shopping flow
   - Use subtle triggers (floating button, side tabs)

3. **Keep It Short**
   - 2-3 questions maximum for high response rates
   - Mix closed (ratings) and open (text) questions
   - Allow anonymous feedback

4. **Privacy & Compliance**
   - GDPR/CCPA compliant data collection
   - Clear privacy policy communication
   - Optional contact information

5. **Close the Feedback Loop**
   - Thank respondents
   - Communicate changes driven by feedback
   - Build trust through transparency

### Metric Comparison

| Metric | Scale | Best For | Limitation |
|--------|-------|----------|------------|
| **NPS** | 0-10 | Long-term loyalty, benchmarking | Not actionable per transaction |
| **CSAT** | 1-5 | Transactional feedback, specific touchpoints | Short-term only |
| **CES** | 1-7 | Friction detection, process optimization | Only measures effort |

**Recommendation**: Implement CSAT as primary metric with optional NPS for post-purchase surveys.

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         STOREFRONT                               │
├─────────────────────────────────────────────────────────────────┤
│  FeedbackPopup.tsx ──► useFeedbackContext() ──► useFeedbackTrigger()
│         │                      │                        │
│         ▼                      ▼                        ▼
│  Rating + Text Input    Context Collection       Trigger Logic
│                         (cart, product,          (button, exit,
│                          session, device)         time-based)
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼ POST /store/feedback
┌─────────────────────────────────────────────────────────────────┐
│                          BACKEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  API Route ──► Zod Validation ──► FeedbackModuleService          │
│                                          │                       │
│                                          ▼                       │
│                                   feedback table                 │
│                                   (PostgreSQL)                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼ (Future: Analytics Integration)
┌─────────────────────────────────────────────────────────────────┐
│                         ANALYTICS                                │
├─────────────────────────────────────────────────────────────────┤
│  PostHog ◄── Event: feedback_submitted                          │
│  Admin Dashboard ◄── Feedback Review Queue                      │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Action** → Trigger opens FeedbackPopup
2. **Context Collection** → Hook gathers cart, product, session data
3. **User Input** → Rating (1-5 or 0-10) + optional text
4. **Submission** → POST to `/store/feedback` with full payload
5. **Storage** → Feedback module persists to database
6. **Analytics** → PostHog event fired for dashboards

---

## Database Design

### Feedback Module Structure

```
apps/backend/src/modules/feedback/
├── index.ts                    # Module definition (FEEDBACK_MODULE)
├── service.ts                  # FeedbackModuleService
├── models/
│   └── feedback.ts             # Data model
└── migrations/
    └── Migration20260113000000.ts
```

### Data Model: `feedback.ts`

```typescript
import { model } from "@medusajs/framework/utils"

const Feedback = model.define("feedback", {
  id: model.id().primaryKey(),
  
  // === FEEDBACK TYPE & SCORE ===
  // Support multiple survey types in one table
  feedback_type: model.enum(["csat", "nps", "ces", "general"]).default("csat"),
  score: model.number(),  // 1-5 for CSAT, 0-10 for NPS, 1-7 for CES
  comment: model.text().nullable(),  // Optional free-text feedback
  
  // === TRIGGER CONTEXT ===
  // How was this feedback initiated?
  trigger: model.enum([
    "floating_button",    // User clicked persistent feedback button
    "exit_intent",        // Mouse left viewport (desktop)
    "post_purchase",      // Shown on checkout success page
    "time_based",         // After X seconds on page
    "scroll_depth",       // After scrolling Y% of page
    "manual"              // Admin-triggered survey
  ]).default("floating_button"),
  
  // === PAGE CONTEXT ===
  page_url: model.text(),           // Full URL including query params
  page_route: model.text(),         // React Router route pattern
  page_title: model.text().nullable(),
  referrer: model.text().nullable(),
  
  // === PRODUCT CONTEXT ===
  // Nullable - only populated on product pages
  product_id: model.text().nullable(),
  product_handle: model.text().nullable(),
  product_title: model.text().nullable(),
  selected_variant_id: model.text().nullable(),
  selected_options: model.json().nullable(),  // { size: "Large", color: "White" }
  
  // === CART CONTEXT ===
  cart_item_count: model.number().default(0),
  cart_total: model.number().default(0),  // In cents
  cart_items: model.json().nullable(),    // [{ id, title, quantity, price }]
  
  // === USER CONTEXT ===
  customer_id: model.text().nullable(),  // If logged in
  session_id: model.text(),              // Anonymous tracking ID (required)
  locale: model.text().nullable(),       // e.g., "en-CA"
  region: model.text().nullable(),       // e.g., "reg_canada"
  
  // === SESSION/DEVICE CONTEXT ===
  // Stored as JSON blob for flexibility
  context: model.json().nullable(),
  // Expected shape:
  // {
  //   time_on_page: number,      // Seconds spent on page
  //   scroll_depth: number,      // 0-100 percentage
  //   viewport_width: number,
  //   viewport_height: number,
  //   device_type: "mobile" | "tablet" | "desktop",
  //   user_agent: string,
  //   touch_enabled: boolean,
  //   connection_type: string    // e.g., "4g", "wifi"
  // }
  
  // === METADATA ===
  submitted_at: model.dateTime(),
  status: model.enum(["new", "reviewed", "actioned", "archived"]).default("new"),
  reviewed_by: model.text().nullable(),   // Admin user ID
  reviewed_at: model.dateTime().nullable(),
  internal_notes: model.text().nullable(), // Admin notes
})
.indexes([
  { on: ["feedback_type"] },
  { on: ["score"] },
  { on: ["trigger"] },
  { on: ["customer_id"] },
  { on: ["product_id"] },
  { on: ["page_route"] },
  { on: ["submitted_at"] },
  { on: ["status"] },
])

export default Feedback
```

### Why This Schema?

| Decision | Rationale |
|----------|-----------|
| `feedback_type` enum | Single table supports NPS/CSAT/CES surveys |
| `trigger` enum | Analytics on which triggers drive responses |
| `context` as JSON | Flexible device/session data without rigid columns |
| `selected_options` as JSON | Product options vary by product type |
| `cart_items` as JSON | Snapshot of cart at feedback time |
| `status` workflow | Enable admin review pipeline (new → reviewed → actioned) |
| `session_id` required | Track anonymous users, link to PostHog |
| Indexed on common query fields | Fast analytics queries |

---

## API Design

### Endpoint: `POST /store/feedback`

**Location:** `apps/backend/src/api/store/feedback/route.ts`

#### Request Schema (Zod Validation)

```typescript
import { z } from "zod"

const FeedbackRequestSchema = z.object({
  // Required fields
  feedback_type: z.enum(["csat", "nps", "ces", "general"]).default("csat"),
  score: z.number().min(0).max(10),
  session_id: z.string().min(1),
  page_url: z.string().url(),
  page_route: z.string(),
  trigger: z.enum([
    "floating_button",
    "exit_intent", 
    "post_purchase",
    "time_based",
    "scroll_depth",
    "manual"
  ]).default("floating_button"),
  
  // Optional fields
  comment: z.string().max(2000).optional(),
  page_title: z.string().optional(),
  referrer: z.string().optional(),
  
  // Product context (optional)
  product_id: z.string().optional(),
  product_handle: z.string().optional(),
  product_title: z.string().optional(),
  selected_variant_id: z.string().optional(),
  selected_options: z.record(z.string()).optional(),
  
  // Cart context
  cart_item_count: z.number().default(0),
  cart_total: z.number().default(0),
  cart_items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    quantity: z.number(),
    price: z.number().optional(),
  })).optional(),
  
  // User context
  customer_id: z.string().optional(),
  locale: z.string().optional(),
  region: z.string().optional(),
  
  // Session/device context
  context: z.object({
    time_on_page: z.number().optional(),
    scroll_depth: z.number().min(0).max(100).optional(),
    viewport_width: z.number().optional(),
    viewport_height: z.number().optional(),
    device_type: z.enum(["mobile", "tablet", "desktop"]).optional(),
    user_agent: z.string().optional(),
    touch_enabled: z.boolean().optional(),
    connection_type: z.string().optional(),
  }).optional(),
})
```

#### Response

**Success (201 Created):**
```json
{
  "feedback": {
    "id": "feedback_01HXYZ...",
    "submitted_at": "2026-01-13T07:00:00.000Z"
  }
}
```

**Error (400 Bad Request):**
```json
{
  "type": "invalid_data",
  "message": "Validation failed",
  "errors": [
    { "field": "score", "message": "Score must be between 0 and 10" }
  ]
}
```

#### Rate Limiting

- **Per session**: Max 5 feedback submissions per hour
- **Per IP**: Max 20 feedback submissions per hour
- **Response**: 429 Too Many Requests

---

## Frontend Components

### Component Structure

```
apps/storefront/app/
├── components/
│   ├── FeedbackPopup.tsx           # Main modal component
│   ├── FeedbackButton.tsx          # Floating trigger button
│   ├── RatingScale.tsx             # Reusable 1-5 or 0-10 rating UI
│   └── feedback/
│       ├── CSATSurvey.tsx          # CSAT-specific layout
│       ├── NPSSurvey.tsx           # NPS-specific layout
│       └── ThankYouMessage.tsx     # Post-submit confirmation
├── hooks/
│   ├── useFeedbackContext.ts       # Gathers all context data
│   ├── useFeedbackTrigger.ts       # Manages trigger logic
│   └── useFeedbackSubmit.ts        # Handles API submission
└── context/
    └── FeedbackContext.tsx         # Global feedback state
```

### FeedbackPopup.tsx - UI Design

#### CSAT Survey (Default - Page Satisfaction)

```
┌─────────────────────────────────────────────────────────────┐
│  ✕                                                          │
│                                                             │
│     How satisfied are you with this page?                   │
│                                                             │
│     😞      😕      😐      🙂      😊                       │
│      1       2       3       4       5                      │
│   Very                              Very                    │
│ Dissatisfied                      Satisfied                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ What could we improve? (optional)                   │   │
│  │                                                     │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                           0/500 characters  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Submit Feedback                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                    Maybe Later                              │
└─────────────────────────────────────────────────────────────┘
```

#### NPS Survey (Post-Purchase)

```
┌─────────────────────────────────────────────────────────────┐
│  ✕                                                          │
│                                                             │
│     How likely are you to recommend                         │
│     Grace's Towel to a friend?                              │
│                                                             │
│   0   1   2   3   4   5   6   7   8   9   10               │
│   ○   ○   ○   ○   ○   ○   ○   ○   ○   ○   ○                │
│                                                             │
│   Not at all                            Extremely           │
│   likely                                likely               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ What's the main reason for your score? (optional)  │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Submit Feedback                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Floating Feedback Button

```
                                    ┌──────────────┐
                                    │  💬 Feedback │
                                    └──────────────┘
                                         ▲
                                         │
                            Fixed position, bottom-right
                            z-index: 40 (below cart drawer)
                            Collapsible on mobile
```

### useFeedbackContext Hook

```typescript
interface FeedbackContext {
  // Page
  pageUrl: string
  pageRoute: string
  pageTitle: string | null
  referrer: string | null
  
  // Product (if on product page)
  product: {
    id: string
    handle: string
    title: string
    selectedVariantId: string | null
    selectedOptions: Record<string, string>
  } | null
  
  // Cart
  cart: {
    itemCount: number
    total: number
    items: Array<{ id: string; title: string; quantity: number; price: number }>
  }
  
  // User
  user: {
    customerId: string | null
    sessionId: string
    locale: string
    region: string
  }
  
  // Session
  session: {
    timeOnPage: number
    scrollDepth: number
    viewportWidth: number
    viewportHeight: number
    deviceType: "mobile" | "tablet" | "desktop"
    userAgent: string
    touchEnabled: boolean
    connectionType: string | null
  }
}

function useFeedbackContext(): FeedbackContext {
  const location = useLocation()
  const { items, cartTotal } = useCart()
  const { customer } = useCustomer()
  const loaderData = useLoaderData() // May contain product
  
  // ... gather all context
}
```

### Trigger Configuration

```typescript
interface TriggerConfig {
  // Floating button - always visible
  floatingButton: {
    enabled: boolean
    position: "bottom-right" | "bottom-left"
    hideOnMobile: boolean
    delay: number // ms before showing
  }
  
  // Exit intent - desktop only
  exitIntent: {
    enabled: boolean
    sensitivity: number // pixels from top
    cooldown: number // hours between triggers
  }
  
  // Time-based
  timeBased: {
    enabled: boolean
    delaySeconds: number
    pages: string[] // route patterns to trigger on
  }
  
  // Post-purchase
  postPurchase: {
    enabled: boolean
    surveyType: "nps" | "csat"
  }
  
  // Scroll depth
  scrollDepth: {
    enabled: boolean
    threshold: number // percentage 0-100
  }
}

const defaultConfig: TriggerConfig = {
  floatingButton: {
    enabled: true,
    position: "bottom-right",
    hideOnMobile: false,
    delay: 3000,
  },
  exitIntent: {
    enabled: true,
    sensitivity: 20,
    cooldown: 24,
  },
  timeBased: {
    enabled: false,
    delaySeconds: 60,
    pages: ["/products/*"],
  },
  postPurchase: {
    enabled: true,
    surveyType: "nps",
  },
  scrollDepth: {
    enabled: false,
    threshold: 75,
  },
}
```

---

## Stories

### Story FEEDBACK-1.1: Create Feedback Backend Module

**Status:** To Do

**As a** Developer,
**I want** to create a Medusa v2 feedback module,
**So that** feedback data can be stored and queried.

#### Acceptance Criteria

**AC1: Module Structure**
- [ ] Create `apps/backend/src/modules/feedback/` directory structure
- [ ] Implement `Feedback` model with all fields from schema
- [ ] Implement `FeedbackModuleService` extending `MedusaService`
- [ ] Register module in `medusa-config.ts`

**AC2: Service Methods**
- [ ] `createFeedbacks(data)` - Create new feedback entry
- [ ] `listFeedbacks(filters, options)` - List with pagination
- [ ] `getFeedbackStats(filters)` - Aggregate stats (avg score, count by type)
- [ ] `getAverageScoreByRoute(route)` - Per-page satisfaction
- [ ] `getAverageScoreByProduct(productId)` - Per-product satisfaction

**AC3: Migration**
- [ ] Create migration file with proper indexes
- [ ] Migration runs successfully: `npm run migrate`

#### Dev Notes

Follow existing pattern from `apps/backend/src/modules/review/`.

---

### Story FEEDBACK-1.2: Create Feedback API Route

**Status:** To Do

**As a** Frontend Developer,
**I want** a REST API endpoint to submit feedback,
**So that** the storefront can send user feedback to the backend.

#### Acceptance Criteria

**AC1: POST /store/feedback**
- [ ] Create `apps/backend/src/api/store/feedback/route.ts`
- [ ] Implement Zod validation per schema above
- [ ] Return 201 with feedback ID on success
- [ ] Return 400 with validation errors on invalid data

**AC2: Rate Limiting**
- [ ] Implement per-session rate limiting (5/hour)
- [ ] Return 429 when limit exceeded
- [ ] Include `Retry-After` header

**AC3: Privacy**
- [ ] Mask any PII in logs (email if ever included)
- [ ] Do not log full `user_agent` in production

#### Dev Notes

```typescript
// apps/backend/src/api/store/feedback/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const data = FeedbackRequestSchema.parse(req.body)
  const service = req.scope.resolve("feedbackModuleService")
  
  const feedback = await service.createFeedbacks({
    ...data,
    submitted_at: new Date(),
  })
  
  res.status(201).json({ 
    feedback: { 
      id: feedback.id,
      submitted_at: feedback.submitted_at,
    } 
  })
}
```

---

### Story FEEDBACK-1.3: Create FeedbackPopup Component

**Status:** To Do

**As a** Shopper,
**I want** to see a feedback popup,
**So that** I can share my satisfaction with the page.

#### Acceptance Criteria

**AC1: CSAT Survey UI**
- [ ] Modal with backdrop (follow `CancelOrderDialog` pattern)
- [ ] 5-point emoji rating scale with labels
- [ ] Optional text input (500 char limit)
- [ ] Submit and "Maybe Later" buttons
- [ ] Close button (X) in top-right

**AC2: Accessibility**
- [ ] Focus trap within modal
- [ ] Keyboard navigation for rating (arrow keys)
- [ ] ARIA labels on all interactive elements
- [ ] Escape key closes modal

**AC3: Mobile Responsive**
- [ ] Full-width on mobile (<640px)
- [ ] Touch-friendly rating targets (min 44px)
- [ ] Virtual keyboard doesn't obscure input

**AC4: Animations**
- [ ] Fade in on open
- [ ] Fade out on close
- [ ] Rating selection feedback (scale/color)

#### Dev Notes

Reference existing components:
- `apps/storefront/app/components/ReviewForm.tsx` - Rating pattern
- `apps/storefront/app/components/CancelOrderDialog.tsx` - Modal pattern

---

### Story FEEDBACK-1.4: Create Floating Feedback Button

**Status:** To Do

**As a** Shopper,
**I want** to see a persistent feedback button,
**So that** I can provide feedback at any time.

#### Acceptance Criteria

**AC1: Button Appearance**
- [ ] Fixed position bottom-right
- [ ] Icon + "Feedback" text (collapsible to icon-only on scroll)
- [ ] z-index below cart drawer (z-40)
- [ ] Subtle shadow and hover state

**AC2: Behavior**
- [ ] Appears after 3 seconds on page
- [ ] Clicking opens FeedbackPopup
- [ ] Hides when popup is open
- [ ] Remembers "dismissed" state in sessionStorage

**AC3: Configuration**
- [ ] Can be disabled per-page via route meta
- [ ] Can be globally disabled via environment variable

---

### Story FEEDBACK-1.5: Implement Context Collection Hook

**Status:** To Do

**As a** Product Manager,
**I want** feedback to include contextual data,
**So that** I can analyze feedback by page, product, and user segment.

#### Acceptance Criteria

**AC1: Page Context**
- [ ] Capture current URL and route pattern
- [ ] Capture page title from document
- [ ] Capture referrer

**AC2: Product Context**
- [ ] Detect if on product page
- [ ] Capture product ID, handle, title
- [ ] Capture selected variant and options

**AC3: Cart Context**
- [ ] Capture cart item count and total
- [ ] Capture cart item summaries (id, title, quantity)

**AC4: User Context**
- [ ] Capture customer ID if logged in
- [ ] Generate/retrieve session ID (localStorage)
- [ ] Capture locale and region

**AC5: Session Context**
- [ ] Track time on page (performance.now())
- [ ] Track scroll depth (max scroll position)
- [ ] Capture viewport dimensions
- [ ] Detect device type from viewport
- [ ] Capture user agent (navigator.userAgent)

---

### Story FEEDBACK-1.6: Implement Trigger Logic

**Status:** To Do

**As a** Product Manager,
**I want** feedback to be triggered at optimal moments,
**So that** we maximize response rates without annoying users.

#### Acceptance Criteria

**AC1: Floating Button Trigger**
- [ ] Always available after initial delay
- [ ] Cooldown after submission (24 hours)

**AC2: Exit Intent Trigger (Desktop)**
- [ ] Detect mouse leaving viewport from top
- [ ] Show CSAT survey
- [ ] Only trigger once per session

**AC3: Post-Purchase Trigger**
- [ ] Show NPS survey on `/checkout/success`
- [ ] Delay 2 seconds after page load
- [ ] Only show once per order

**AC4: Cooldown Management**
- [ ] Store last feedback timestamp in localStorage
- [ ] Respect cooldown periods per trigger type
- [ ] Clear cooldowns on logout

---

### Story FEEDBACK-1.7: NPS Survey Variant

**Status:** To Do

**As a** Product Manager,
**I want** a 0-10 NPS survey for post-purchase,
**So that** I can track customer loyalty over time.

#### Acceptance Criteria

**AC1: NPS UI**
- [ ] 0-10 horizontal scale
- [ ] "Not at all likely" to "Extremely likely" labels
- [ ] Single-click selection (no submit button initially)
- [ ] Follow-up text input after selection

**AC2: NPS Calculation**
- [ ] Backend service calculates NPS score
- [ ] Promoters (9-10), Passives (7-8), Detractors (0-6)
- [ ] NPS = %Promoters - %Detractors

---

### Story FEEDBACK-1.8: PostHog Integration

**Status:** To Do

**As a** Data Analyst,
**I want** feedback events in PostHog,
**So that** I can correlate feedback with user behavior.

#### Acceptance Criteria

**AC1: Client-Side Event**
- [ ] Fire `feedback_submitted` event on successful submission
- [ ] Include: feedback_type, score, trigger, page_route, has_comment

**AC2: Server-Side Event (Optional)**
- [ ] Fire event from backend after DB write
- [ ] Link to customer ID for logged-in users

---

### Story FEEDBACK-1.9: Admin Review Interface (Future)

**Status:** Backlog

**As an** Admin,
**I want** to review and act on feedback,
**So that** I can prioritize improvements.

#### Acceptance Criteria

- [ ] List view with filters (status, score, date, page)
- [ ] Detail view with full context
- [ ] Actions: Mark as Reviewed, Mark as Actioned, Archive
- [ ] Internal notes field
- [ ] Export to CSV

---

## Implementation Order

| Phase | Stories | Priority |
|-------|---------|----------|
| **Phase 1: Core** | 1.1, 1.2, 1.3, 1.4 | P0 - MVP |
| **Phase 2: Context** | 1.5, 1.6 | P0 - MVP |
| **Phase 3: NPS** | 1.7 | P1 - Post-Launch |
| **Phase 4: Analytics** | 1.8 | P1 - Post-Launch |
| **Phase 5: Admin** | 1.9 | P2 - Future |

---

## Testing Strategy

### Unit Tests

| Component | Test File | Coverage |
|-----------|-----------|----------|
| FeedbackModuleService | `service.spec.ts` | CRUD, stats calculation |
| API Route | `route.spec.ts` | Validation, rate limiting |
| FeedbackPopup | `FeedbackPopup.test.tsx` | Render, interaction, submission |
| useFeedbackContext | `useFeedbackContext.test.ts` | Context gathering |

### Integration Tests

| Scenario | Location |
|----------|----------|
| Full submission flow | `apps/backend/integration-tests/feedback/` |
| Context accuracy | `apps/storefront/tests/feedback/` |

### E2E Tests

| Test Case | File |
|-----------|------|
| Submit CSAT from floating button | `apps/e2e/tests/feedback/csat-submit.spec.ts` |
| Submit NPS on checkout success | `apps/e2e/tests/feedback/nps-post-purchase.spec.ts` |
| Rate limiting enforcement | `apps/e2e/tests/feedback/rate-limit.spec.ts` |

---

## Security Considerations

1. **Rate Limiting**: Prevent spam/abuse
2. **Input Sanitization**: Zod validation on all inputs
3. **PII Masking**: No emails logged, user_agent truncated
4. **CSRF Protection**: Medusa built-in CSRF handling
5. **Session ID**: Use cryptographically secure random ID

---

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| zod | existing | Request validation |
| @medusajs/framework | existing | Module system |
| posthog-js | existing | Analytics events |

No new dependencies required.

---

## Rollout Plan

1. **Development**: Implement behind feature flag
2. **Staging**: Enable for internal testing
3. **Soft Launch**: Enable floating button only (5% of traffic)
4. **Full Launch**: Enable all triggers (100% of traffic)
5. **Iteration**: Adjust trigger timing based on response rates

---

## Open Questions

1. **Q**: Should we store cart items as JSON snapshot or just item count?
   **A**: JSON snapshot - provides richer context for debugging issues

2. **Q**: Should feedback be anonymous by default?
   **A**: Yes - customer_id is optional, session_id is required

3. **Q**: How long should we retain feedback data?
   **A**: TBD - Recommend 2 years for trend analysis, then archive

---

## References

- [Userpilot - User Feedback Best Practices](https://userpilot.com/blog/user-feedback-best-practices/)
- [ZonkaFeedback - Feedback Widgets](https://www.zonkafeedback.com/blog/feedback-widgets)
- [SurveySparrow - NPS vs CSAT vs CES](https://surveysparrow.com/blog/measuring-customer-satisfaction-csat-nps-ces/)
- [Delighted - Customer Satisfaction Metrics](https://delighted.com/blog/choose-customer-satisfaction-metric-csat-nps-ces)
- [Chatwoot - Feedback Widget Best Practices](https://app.chatwoot.com/hc/crowd/articles/1706035479)

---

*Last Updated: 2026-01-13*
