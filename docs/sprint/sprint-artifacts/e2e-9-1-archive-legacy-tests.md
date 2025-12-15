# Story 9-1: Archive Legacy Tests

**Epic:** Epic 9 - Cleanup & Documentation  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR11.1

---

## User Story

As a **QA engineer**,  
I want **legacy failing tests archived**,  
So that **the test suite only contains working, relevant tests**.

---

## Acceptance Criteria

### AC1: Legacy Files Archived
**Given** the legacy test files exist  
**When** I run the archive script  
**Then** legacy test files are moved to `archive/` folder

### AC2: Clean Test Suite
**Given** the archive is complete  
**When** I run the test suite  
**Then** only the new API-first tests run

---

## Implementation Tasks

### Task 1: Create Archive Script
**File:** `apps/e2e/scripts/archive-legacy.sh`

```bash
#!/bin/bash

# Create archive directory
mkdir -p tests/archive

# List of legacy test files to archive
LEGACY_FILES=(
  "tests/checkout.spec.ts"
  "tests/grace-period.spec.ts"
  "tests/visual-regression.spec.ts"
  "tests/network-failures.spec.ts"
)

# Move files to archive
for file in "${LEGACY_FILES[@]}"; do
  if [ -f "$file" ]; then
    mv "$file" "tests/archive/"
    echo "Archived: $file"
  else
    echo "Not found: $file"
  fi
done

echo "Archive complete!"
```

### Task 2: Update .gitignore
**File:** `apps/e2e/.gitignore` (append)

```gitignore
# Keep archive but don't run tests from it
# tests/archive/ is tracked but excluded from test runs
```

### Task 3: Update Playwright Config
**File:** `apps/e2e/playwright.config.ts` (update testMatch)

```typescript
export default defineConfig({
  // Exclude archive folder from test runs
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/archive/**'],
  // ... rest of config
});
```

### Task 4: Verify Archive
**File:** `apps/e2e/tests/archive/README.md`

```markdown
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
```

---

## Definition of Done

- [ ] Archive script created
- [ ] Legacy files moved to archive/
- [ ] Playwright config excludes archive
- [ ] Test suite runs without legacy tests
- [ ] Archive README documents reason

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR11.1
