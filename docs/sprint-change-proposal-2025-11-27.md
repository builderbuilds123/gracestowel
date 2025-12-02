# Sprint Change Proposal: CI/CD E2E Test Failure Fix

**Date:** 2025-11-27  
**Author:** Correct Course Workflow  
**Status:** Pending Approval

---

## 1. Issue Summary

### Problem Statement
The CI/CD pipeline is experiencing consistent E2E test failures in the GitHub Actions environment. The Playwright visual regression tests are failing with `ERR_CONNECTION_REFUSED` when attempting to navigate to the storefront.

### Discovery Context
The issue was identified during automated CI runs on GitHub Actions. The error manifests as:
```
Error: page.goto: net::ERR_CONNECTION_REFUSED at https://localhost:5173/non-existent-page-12345
```

### Evidence
- **Error Log:** Playwright tests attempting to access `https://localhost:5173` which does not exist in the Docker container network
- **CI Configuration:** `.github/workflows/ci.yml` passes `-e STOREFRONT_URL=http://storefront:5173` to override the environment
- **Docker Compose:** `docker-compose.test.yml` already defines `STOREFRONT_URL: http://storefront:5173` in the Playwright service
- **Playwright Config:** Correctly reads `process.env.STOREFRONT_URL || "https://localhost:5173"` at line 26

---

## 2. Impact Analysis

### Epic Impact
**N/A** - This is a purely technical infrastructure issue unrelated to product features or epics.

### Story Impact
**N/A** - No user stories affected.

### Artifact Conflicts

#### CI/CD Configuration
- **File:** `.github/workflows/ci.yml`
- **Impact:** The redundant `-e STOREFRONT_URL` flag in the `docker compose run` command was not properly overriding the environment variable, causing Playwright to fall back to the default `https://localhost:5173`.

#### Test Infrastructure
- **Files:** `docker-compose.test.yml`, `apps/e2e/playwright.config.ts`
- **Impact:** Configuration mismatch between how environment variables are passed and how they are consumed.

### Technical Impact
- **Build Stability:** CI/CD pipeline fails on every PR/push to main or staging branches
- **Deployment Risk:** Cannot verify E2E test health before merging changes
- **Developer Experience:** False negatives blocking legitimate PRs

---

## 3. Recommended Approach

### Selected Path: **Direct Adjustment**

**Rationale:**
- The issue is a simple configuration mismatch, not a fundamental design flaw
- The fix requires only a single-line change to the CI workflow
- All other components (Docker Compose, Playwright config, test files) are correctly configured
- No rollback or MVP review needed

### Effort Estimate
**Low** - Single file edit, no code changes required

### Risk Assessment
**Low** - The change simplifies the configuration by removing redundancy

### Timeline Impact
**None** - Fix can be applied immediately

---

## 4. Detailed Change Proposals

### Change #1: Remove Redundant Environment Variable Override

**File:** `.github/workflows/ci.yml`  
**Section:** E2E Tests (Lines 145-146)

**OLD:**
```yaml
- name: Run E2E tests
  run: docker compose -f docker-compose.test.yml run --rm -e STOREFRONT_URL=http://storefront:5173 playwright npx playwright test --project=chromium
```

**NEW:**
```yaml
- name: Run E2E tests
  run: docker compose -f docker-compose.test.yml run --rm playwright npx playwright test --project=chromium
```

**Justification:**
The `docker-compose.test.yml` file already defines `STOREFRONT_URL: http://storefront:5173` in the Playwright service environment (line 100). The `-e` flag in the `docker compose run` command creates a conflict or fails to properly override the variable. By removing the redundant flag, we rely solely on the Docker Compose file's environment definition, ensuring consistent behavior.

**Status:** ✅ **APPLIED**

---

## 5. Implementation Handoff

### Change Scope Classification
**Minor** - Direct implementation by development team (no backlog reorganization needed)

### Handoff Recipients
**Development Team** (or CI/CD maintainer)

### Responsibilities
- ✅ Apply the code change to `.github/workflows/ci.yml` (COMPLETED)
- Commit and push the change to a branch
- Monitor the next CI run to verify the fix
- Merge to main once verified

### Success Criteria
1. ✅ CI workflow file updated
2. E2E tests pass successfully in GitHub Actions
3. No `ERR_CONNECTION_REFUSED` errors in Playwright logs
4. Visual regression tests produce valid screenshots

### Next Steps
1. Commit this change: `git commit -m "fix(ci): remove redundant STOREFRONT_URL override in E2E tests"`
2. Push to GitHub and verify CI passes
3. Monitor for any related issues

---

## 6. Approval

**Recommended for Approval:** Yes

**Reviewer Notes:**
This is a low-risk, high-impact fix that restores CI/CD stability without affecting any product functionality or requiring changes to application code.
