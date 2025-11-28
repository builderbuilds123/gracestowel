# Sprint Change Proposal - Docker Build Failure Fix

**Date:** 2025-11-28
**Author:** Correct Course Workflow
**Scope Classification:** Minor - Direct Implementation
**Status:** ✅ RESOLVED - Docker Storefront Build Fixed

**Final Resolution:** Docker storefront build now succeeds! Fixed both missing wrangler config AND Alpine Linux binary incompatibility.

---

## 1. Issue Summary

### Problem Statement
CI/CD e2e tests are failing during Docker image build for the storefront application. The build fails with error: `"No config file detected. This command requires a Wrangler configuration file."`

### Discovery Context
- **Trigger:** GitHub Actions e2e test workflow execution
- **Stage:** Docker build process (deps stage)
- **Impact:** Complete CI/CD pipeline blockage

### Evidence
```
#15 30.74 ✘ [ERROR] No config file detected. This command requires a Wrangler configuration file.
#15 30.79 npm error code 1
#15 30.79 npm error path /app
#15 30.79 npm error command failed
#15 30.79 npm error command sh -c npm run cf-typegen
```

### Root Cause
The storefront's `postinstall` script (`npm run cf-typegen` which executes `wrangler types`) requires Wrangler configuration files (`wrangler.toml`, `wrangler.jsonc`) to be present. The Dockerfile's `deps` stage copies only `package.json`, causing the postinstall hook to fail when `npm install` runs.

**Files Involved:**
- `apps/storefront/Dockerfile:11` - Missing wrangler config file copy
- `apps/storefront/package.json:10` - postinstall hook requiring wrangler config

---

## 2. Impact Analysis

### Epic Impact
**No impact on feature epics.**

This is a build infrastructure issue that does not affect any of the PostHog Analytics Integration epics:
- ✅ Epic 1: Foundational Event Tracking - No changes
- ✅ Epic 2: Comprehensive Data Capture & User Identification - No changes
- ✅ Epic 3: Admin Analytics & Dashboarding - No changes
- ✅ Epic 4: PostHog Monitoring & Observability - No changes

### Story Impact
**No story modifications required.**

All planned stories for Epic 4 (current sprint focus) remain valid. The Docker build fix is orthogonal to feature implementation.

### Artifact Conflicts

#### PRD Documents
- **1-Hour Cancellation Window PRD** - ✅ No conflicts
- **PostHog Analytics Integration PRD** - ✅ No conflicts
- **MVP Scope** - ✅ Remains achievable

#### Architecture Documents
- **Deployment Architecture** - ✅ No changes needed
  - Issue affects e2e test infrastructure, not production Cloudflare Workers deployment
  - No architectural patterns or technology choices affected

#### UI/UX Specifications
- ✅ Zero user-facing impact

#### Other Artifacts
**Affected:**
- ❌ CI/CD Pipeline - Currently failing, will be fixed
- ❌ Docker Build Process - Requires one-line modification

**Not Affected:**
- ✅ Infrastructure as Code
- ✅ Monitoring setup
- ✅ Testing strategies (tests themselves are correct)
- ✅ API contracts
- ✅ Database schemas

### Technical Impact
- **Build System:** One-line Dockerfile change
- **Code:** Zero changes to application code
- **Infrastructure:** Zero changes to production infrastructure
- **Deployment:** Unblocks CI/CD pipeline

---

## 3. Recommended Approach

**Selected Path:** **Direct Adjustment** (Option 1)

### Rationale
1. **Minimal Effort:** Single-line change in Dockerfile
2. **Low Risk:** Well-understood problem with proven solution pattern
3. **Immediate Impact:** Unblocks CI/CD pipeline within minutes
4. **No Scope Change:** Zero impact on feature work, timeline, or epic planning
5. **Root Cause Fix:** Addresses the actual problem (missing required files in Docker context)

### Alternatives Considered

**Option 2: Make postinstall conditional**
- Would require modifying package.json to check for wrangler config existence
- More complex than necessary
- Doesn't address the root cause (missing files)
- Rejected: Over-engineered for the problem

**Option 3: Remove postinstall hook**
- Would require modifying CI/CD to run typegen separately
- Breaks local development workflow
- More invasive change
- Rejected: Creates more problems than it solves

### Effort & Risk Assessment
- **Implementation Time:** 5 minutes
- **Testing Time:** 10 minutes (local Docker build + CI/CD verification)
- **Risk Level:** 🟢 Low
  - Minimal change surface
  - Easy to test and verify
  - No production deployment changes
  - Easy rollback if needed

---

## 4. Detailed Change Proposals

### Change #1: Fix Dockerfile Wrangler Config Copy

**File:** `apps/storefront/Dockerfile`
**Section:** Dependencies stage (deps)
**Lines:** 8-12

#### Current Code
```dockerfile
# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json ./
RUN npm install
```

#### Proposed Change
```dockerfile
# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy package files and wrangler config (required for postinstall typegen)
COPY package.json wrangler.toml wrangler.jsonc ./
RUN npm install
```

#### Technical Details
- **Change Type:** File copy instruction modification
- **Lines Modified:** 1 line (line 11)
- **Files Added to Context:** `wrangler.toml`, `wrangler.jsonc`
- **Behavior:** Ensures wrangler config is available when postinstall hook runs during `npm install`

#### Justification
The `postinstall` script defined in `package.json:10` executes `wrangler types`, which requires a Wrangler configuration file to function. By including these config files in the Docker build context before running `npm install`, we satisfy the postinstall hook's requirements.

#### Testing Plan
```bash
# 1. Test local Docker build
cd apps/storefront
docker build -t storefront-test .
# Expected: Build succeeds without wrangler errors

# 2. Verify CI/CD pipeline
git add apps/storefront/Dockerfile
git commit -m "fix: include wrangler config in Docker build context"
git push
# Expected: GitHub Actions e2e tests pass
```

---

### Change #2: Verify .dockerignore (Optional Enhancement)

**File:** `apps/storefront/.dockerignore` (if exists)
**Priority:** Low
**Action:** Verify that wrangler config files are not excluded

#### Check for Exclusions
Ensure `.dockerignore` does NOT contain:
- `wrangler.toml`
- `wrangler.jsonc`
- `*.toml` (or has explicit exception)
- `*.jsonc` (or has explicit exception)

#### Rationale
Prevent accidental exclusion of required config files in future builds.

#### Implementation
```bash
# Check if .dockerignore exists and review contents
cat apps/storefront/.dockerignore 2>/dev/null || echo "File does not exist"

# If problematic patterns found, remove or add exceptions
# Example: Change "*.toml" to exclude only specific files
```

---

## 5. Implementation Handoff

### Change Scope Classification
**🟢 Minor - Direct Implementation**

### Handoff Recipients
**Development Team** - Direct implementation

### Responsibilities
1. **Developer:**
   - Apply Dockerfile change
   - Test Docker build locally
   - Commit and push changes
   - Monitor CI/CD pipeline

2. **CI/CD System:**
   - Automatically run e2e tests
   - Validate Docker image builds successfully

### Implementation Steps
1. Update `apps/storefront/Dockerfile:11` with proposed change
2. Run local Docker build test: `docker build -t storefront-test apps/storefront`
3. Verify build completes without errors
4. Commit change with message: `fix: include wrangler config in Docker build for postinstall typegen`
5. Push to trigger CI/CD
6. Verify GitHub Actions e2e tests pass
7. Close issue as resolved

### Success Criteria
- ✅ Docker build completes successfully for storefront
- ✅ `npm install` postinstall hook executes without errors
- ✅ CI/CD e2e tests pass in GitHub Actions
- ✅ No regression in build time or image size
- ✅ Local development workflow unaffected

### Rollback Plan
If unexpected issues arise:
```bash
# Revert the commit
git revert HEAD
git push

# Or restore original Dockerfile
git checkout HEAD~1 apps/storefront/Dockerfile
git commit -m "revert: rollback wrangler config Docker change"
git push
```

---

## 6. Timeline & Dependencies

### Timeline Impact
**None** - This fix does not affect feature development timeline.

### Dependencies
**None** - This change is independent of all feature work.

### Blocking Issues Resolved
- ✅ Unblocks CI/CD e2e testing
- ✅ Enables Docker image builds
- ✅ Allows deployment pipeline to function

---

## 7. Approval & Next Steps

### Approval Status
✅ **Approved & Implemented**

### Sign-off
- [x] Development Team Lead - Approved 2025-11-28
- [x] Implementation Complete - 2025-11-28

### Next Actions After Approval
1. Implement Dockerfile change
2. Test locally
3. Push to repository
4. Verify CI/CD passes
5. Update this document status to "Implemented"
6. Close related issues/tickets

---

## 8. Appendix

### Related Files
- `apps/storefront/Dockerfile` - File requiring modification
- `apps/storefront/package.json` - Contains postinstall script
- `apps/storefront/wrangler.toml` - Config file needed by wrangler
- `apps/storefront/wrangler.jsonc` - Alternative config file format

### Reference Links
- Wrangler Documentation: https://developers.cloudflare.com/workers/wrangler/
- Docker COPY instruction: https://docs.docker.com/engine/reference/builder/#copy

### Issue Category
**Category:** Build Infrastructure
**Type:** Bug Fix
**Severity:** High (blocks CI/CD)
**Complexity:** Low (single-line fix)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-28
**Next Review:** After implementation
