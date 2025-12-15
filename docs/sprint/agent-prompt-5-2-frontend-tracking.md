# Agent Implementation Prompt: Epic 5.2 Frontend Event Tracking

## Mission

Implement the remaining stories in the **Comprehensive Frontend Event Tracking** epic (5.2). Iterate on each implementation until it meets all acceptance criteria, passes tests, and adheres to project standards.

## Stories to Implement

Located in `docs/sprint/sprint-artifacts/`:

| Story | File | Status | Description |
|-------|------|--------|-------------|
| 5.2.2 | `5-2-2-navigation-tracking.md` | Todo | Navigation events on route changes |
| 5.2.3 | `5-2-3-scroll-depth-tracking.md` | Todo | Scroll depth milestones (25/50/75/100%) |
| 5.2.4 | `5-2-4-engagement-idle-tracking.md` | Todo | Engaged vs idle time tracking |
| 5.2.5 | `5-2-5-form-interaction-tracking.md` | Todo | Form interaction events (no values) |
| 5.2.6 | `5-2-6-integration-and-tests.md` | Todo | Wire hooks in root.tsx + 17 tests |

Reference the parent story for full context: `docs/sprint/sprint-artifacts/5-2-comprehensive-frontend-tracking.md`

## Critical Context Files

**MUST READ before implementation:**

1. **Project Context & Rules**: `docs/project_context.md`
   - Cloudflare Workers constraints (no Node.js APIs in storefront)
   - Environment variable access patterns (`window.ENV` on client, not `process.env`)
   - Testing rules (Vitest + happy-dom for storefront)

2. **Architecture**:
   - `docs/architecture/overview.md` - System overview
   - `docs/architecture/storefront.md` - Storefront patterns

3. **Existing Implementation** (Story 5.2.1 is DONE - use as reference):
   - `apps/storefront/app/utils/monitored-fetch.ts` - Pattern for SSR-safe PostHog
   - `apps/storefront/app/utils/monitored-fetch.test.ts` - Test patterns

4. **Steering Files**: Check `.kiro/steering/` for any additional coding standards

## Implementation Requirements

### Technical Constraints

```typescript
// ✅ CORRECT: SSR-safe PostHog initialization
const posthog = typeof window !== 'undefined' 
  ? (await import('posthog-js')).default 
  : null;

// ✅ CORRECT: Environment variable access in Cloudflare Workers
const apiKey = typeof window !== 'undefined' ? window.ENV?.POSTHOG_API_KEY : null;

// 🛑 WRONG: Will crash in Cloudflare Workers
const apiKey = process.env.POSTHOG_API_KEY;
```

### Performance Requirements
- Event handler overhead: **<5ms median**
- Use `requestAnimationFrame` for scroll tracking
- Debounce high-frequency events
- Non-blocking analytics (fire-and-forget, no await in UI path)

### Privacy Requirements
- Honor `respect_dnt` setting
- Gate under `frontend-event-tracking` PostHog flag
- Never capture form field values
- Sanitize URLs (strip tokens, auth params)
- Exclude sensitive fields entirely (password, card, PII)

### File Structure

```
apps/storefront/app/
├── hooks/
│   ├── useNavigationTracking.ts      # Story 5.2.2
│   ├── useScrollTracking.ts          # Story 5.2.3
│   ├── useEngagementTracking.ts      # Story 5.2.4
│   └── useFormTracking.ts            # Story 5.2.5
├── utils/
│   └── monitored-fetch.ts            # Already done (5.2.1)
├── components/
│   └── AnalyticsTracking.tsx         # Story 5.2.6 - wrapper component
└── root.tsx                          # Story 5.2.6 - integrate hooks
```

## Iteration Protocol

For each story, follow this cycle:

### 1. Implement
- Read the story file completely
- Implement according to acceptance criteria
- Follow patterns from `monitored-fetch.ts`

### 2. Test
- Write unit tests (Vitest + happy-dom)
- Run: `pnpm --filter storefront test`
- Ensure all tests pass

### 3. Validate
- Check for TypeScript errors: `pnpm --filter storefront typecheck`
- Check for lint errors: `pnpm --filter storefront lint`
- Verify SSR compatibility (no `window` access without guards)

### 4. Iterate
- If any check fails, fix and re-validate
- Continue until all criteria met

### 5. Update Story Status
- Update the story file's `Status:` field to `Done`
- Add a `## Dev Agent Record` section with:
  - Implementation notes
  - File list of all modified files
  - Any deviations from spec with justification

## Event Schemas (Reference)

```typescript
// Navigation (5.2.2)
{ event: 'navigation', properties: {
  from_path: string, to_path: string,
  navigation_type: 'link' | 'back' | 'forward' | 'direct',
  time_on_previous_page_ms: number
}}

// Scroll Depth (5.2.3)
{ event: 'scroll_depth', properties: {
  depth_percentage: 25 | 50 | 75 | 100,
  page_path: string, page_height: number, time_to_depth_ms: number
}}

// Page Engagement (5.2.4)
{ event: 'page_engagement', properties: {
  page_path: string, engaged_time_ms: number,
  idle_time_ms: number, total_time_ms: number
}}

// Form Interaction (5.2.5)
{ event: 'form_interaction', properties: {
  form_name: string, field_name: string,
  interaction_type: 'focus' | 'blur' | 'submit' | 'error',
  error_message?: string
}}
```

## Success Criteria

Implementation is complete when:

- [ ] All 5 stories have `Status: Done`
- [ ] All hooks are mounted in `root.tsx` via `AnalyticsTracking` component
- [ ] 17+ tests pass covering all hooks and event payloads
- [ ] `pnpm --filter storefront test` passes
- [ ] `pnpm --filter storefront typecheck` passes
- [ ] `pnpm --filter storefront lint` passes
- [ ] No `process.env` usage in client code
- [ ] All events respect DNT and feature flag
- [ ] All changes committed to branch `feature/5-2-frontend-tracking`
- [ ] Commit messages follow conventional commits format (e.g., `feat(storefront): add navigation tracking hook`)

## Commands Reference

```bash
# Run storefront tests
pnpm --filter storefront test

# Type check
pnpm --filter storefront typecheck

# Lint
pnpm --filter storefront lint

# Run specific test file
pnpm --filter storefront test useNavigationTracking

# Dev server (for manual verification)
pnpm --filter storefront dev
```

## Begin

Start with Story 5.2.2 (Navigation Tracking). Read the story file, implement, test, validate, iterate until done. Then proceed to 5.2.3, and so on through 5.2.6.
