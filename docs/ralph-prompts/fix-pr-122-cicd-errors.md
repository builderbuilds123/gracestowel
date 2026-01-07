# Task: Fix All CI/CD Errors in PR #122

Fix all failing CI/CD checks in Pull Request #122 until all checks pass. This is an iterative task that requires identifying errors, fixing them, and verifying until complete.

## Phase 1: Initial Assessment

### 1.1 Check PR Status
- Use GitHub API or web interface to check PR #122 status
- Identify all failing CI/CD checks from GitHub Actions
- Document each failing check with:
  - Check name (e.g., "Validate", "Backend Unit Tests", "E2E Tests")
  - Error messages and logs
  - Link to failing workflow run
  - Job and step that failed

### 1.2 Categorize Failures
Group failures by type:
- **Validation Errors**: Lint, typecheck, lockfile drift, secrets scanning, security scanning
- **Test Failures**: Backend unit tests, storefront tests, E2E tests
- **Build Errors**: Docker build failures, dependency installation issues
- **Security Issues**: Gitleaks findings, Trivy vulnerabilities, npm audit failures
- **API Contract Tests**: Postman/Newman test failures (if applicable)

### 1.3 Create Error Inventory
Document all failures in a structured format:
```
## Failing Checks Summary

### Validation Stage
- [ ] Lockfile drift guard: [error details]
- [ ] Secrets scanning (Gitleaks): [findings]
- [ ] Dependency scanning (Trivy): [vulnerabilities]
- [ ] Lint & Typecheck: [errors]
- [ ] Security audit: [issues]

### Test Stage
- [ ] Backend unit tests: [failing tests]
- [ ] Storefront tests: [failing tests]
- [ ] E2E tests: [failing tests]

### API Contract Tests (if applicable)
- [ ] Store API tests: [failures]
- [ ] Admin API tests: [failures]
- [ ] Custom endpoints tests: [failures]
```

## Phase 2: Fix Iteration

### 2.1 Fix Validation Errors

#### Lockfile Drift Guard
- **Check**: Ensure no forbidden lockfiles exist (package-lock.json, yarn.lock, npm-shrinkwrap.json)
- **Fix**: Remove any forbidden lockfiles if present
- **Verify**: Run `git ls-files | grep -E '(package-lock\.json|yarn\.lock|npm-shrinkwrap\.json)'` should return nothing

#### Secrets Scanning (Gitleaks)
- **Check**: Review Gitleaks findings
- **Fix**: Remove or mask any secrets found in code
- **Verify**: Run `gitleaks detect --source . --verbose` locally (if available) or check GitHub Actions logs

#### Dependency Scanning (Trivy)
- **Check**: Review Trivy vulnerability findings (CRITICAL and HIGH severity)
- **Fix**: Update vulnerable dependencies or add exceptions if false positives
- **Verify**: Run `pnpm audit --audit-level=high` locally

#### Lint & Typecheck
- **Check**: Review lint and typecheck errors
- **Fix**: 
  - Fix linting errors: `pnpm turbo run lint --filter=@gracestowel/backend --filter=apps-storefront`
  - Fix type errors: `pnpm turbo run typecheck`
- **Verify**: Run locally before committing:
  ```bash
  pnpm turbo run lint typecheck
  ```

#### Security Audit
- **Check**: Review npm audit findings
- **Fix**: Update vulnerable packages or add overrides if necessary
- **Verify**: Run `pnpm audit --audit-level=high` locally

### 2.2 Fix Test Failures

#### Backend Unit Tests
- **Check**: Review failing test output
- **Fix**: 
  - Fix test code in `apps/backend/src/**/*.spec.ts`
  - Fix source code if tests reveal bugs
  - Update mocks if needed
- **Verify**: Run locally:
  ```bash
  cd apps/backend
  pnpm test
  ```

#### Storefront Tests
- **Check**: Review failing test output
- **Fix**:
  - Fix test code in `apps/storefront/**/*.test.tsx`
  - Fix source code if tests reveal bugs
  - Update mocks if needed
- **Verify**: Run locally:
  ```bash
  cd apps/storefront
  pnpm test
  ```

#### E2E Tests
- **Check**: Review Playwright test failures
- **Fix**:
  - Fix test code in `apps/e2e/tests/`
  - Fix application code if tests reveal bugs
  - Check Docker setup if container issues
  - Verify environment variables are set correctly
- **Verify**: Run locally if Docker is available:
  ```bash
  docker compose -f docker-compose.test.yml up -d
  cd apps/e2e
  pnpm exec playwright test
  ```

### 2.3 Fix API Contract Tests (if applicable)
- **Check**: Review Newman test failures
- **Fix**:
  - Update Postman collections in `postman/collections/`
  - Update environment variables in `postman/environments/`
  - Fix API endpoints if tests reveal bugs
- **Verify**: Run locally if staging environment is available:
  ```bash
  newman run postman/collections/*.postman_collection.json \
    --environment postman/environments/staging.postman_environment.json
  ```

### 2.4 Fix Build Errors
- **Check**: Review Docker build or dependency installation errors
- **Fix**:
  - Fix Dockerfiles if build issues
  - Fix package.json if dependency issues
  - Ensure all required files are present (e.g., wrangler.jsonc for storefront)
- **Verify**: Test Docker builds locally if possible

## Phase 3: Verification & Iteration

### 3.1 Commit Fixes
After fixing each category of errors:
- Commit with descriptive messages: `fix(ci): [category] - [brief description]`
- Example: `fix(ci): lint - resolve TypeScript type errors in cart service`
- Push changes to PR branch

### 3.2 Check PR Status Again
- Wait for GitHub Actions to run (or trigger manually)
- Check PR #122 status again
- Identify any remaining failures
- If failures remain, return to Phase 2

### 3.3 Iterate Until Complete
- Continue fixing and verifying until:
  - All validation checks pass
  - All test checks pass
  - All build checks pass
  - PR shows all checks green ✅

## Key Files & Commands Reference

### CI/CD Workflow Files
- `.github/workflows/ci.yml` - Main CI pipeline
- `.github/workflows/api-contract-tests.yml` - API contract tests

### Local Verification Commands
```bash
# Validation
pnpm turbo run lint typecheck
pnpm audit --audit-level=high

# Tests
pnpm turbo run test --filter=@gracestowel/backend
pnpm turbo run test --filter=apps-storefront

# E2E (requires Docker)
docker compose -f docker-compose.test.yml up -d
cd apps/e2e && pnpm exec playwright test
```

### Project Structure
- Backend: `apps/backend/`
- Storefront: `apps/storefront/`
- E2E Tests: `apps/e2e/`
- Postman Collections: `postman/collections/`
- CI Workflows: `.github/workflows/`

## Success Criteria

- [ ] All validation checks pass (lint, typecheck, security scans)
- [ ] All unit tests pass (backend and storefront)
- [ ] All E2E tests pass
- [ ] All API contract tests pass (if applicable)
- [ ] All build steps complete successfully
- [ ] PR #122 shows all CI/CD checks green ✅
- [ ] No new errors introduced
- [ ] All fixes are committed with descriptive messages
- [ ] TASK_COMPLETE

## Notes

- This is an iterative task - expect multiple cycles of fix → verify → fix
- Some errors may be interdependent - fix foundational issues first (e.g., type errors before test errors)
- If a fix requires significant refactoring, document the approach before implementing
- Always verify fixes locally when possible before pushing
- If a check is flaky, document it and consider if it needs to be addressed or if it's a known issue

