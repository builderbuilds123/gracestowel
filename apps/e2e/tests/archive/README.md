# Archived Tests

These tests have been archived as part of the E2E Testing Overhaul.

## Reason for Archive
- Tests were failing or flaky
- Tests used outdated patterns (UI-first instead of API-first)
- Tests had hardcoded dependencies

## Files Archived
- `checkout.spec.ts` - Replaced by API-first checkout tests
- `grace-period.spec.ts` - Replaced by order modification tests
- `visual-regression.spec.ts` - Deferred (UI may be revamped)
- `network-failures.spec.ts` - Replaced by network error tests

## Restoration
If needed, these tests can be restored and updated to follow
the new API-first testing patterns.
