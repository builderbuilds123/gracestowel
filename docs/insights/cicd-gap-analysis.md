# CI/CD Pipeline Maturity & Gap Analysis

This document evaluates the current Grace Stowel CI/CD pipeline against industry-standard DevOps best practices.

## 1. Continuous Integration (CI)

| Component | Status | Current Implementation | Gaps / Recommendations |
| :--- | :---: | :--- | :--- |
| **Linting & Formatting** | ✅ | `npm run lint` in `validate` job. | None. |
| **Static Analysis** | ✅ | TypeScript `tsc --noEmit` for both apps. | None. |
| **Dependency Security** | ⚠️ | `npm audit` runs in `validate`. | **Gap**: No automated fix (Renovate/Dependabot) or deep SAST scanning (CodeQL/SonarQube). |
| **Secrets Detection** | ❌ | None. | **Gap**: Risk of committing API keys. **Rec**: Add `trufflehog` or `gitleaks` step. |
| **Unit/Integration Tests** | ✅ | Jest (Backend) & Vitest (Storefront). | None. |
| **E2E Testing** | ✅ | Playwright with Golden DB & Edge Runtime. | None. |

## 2. Continuous Delivery (CD)

| Component | Status | Current Implementation | Gaps / Recommendations |
| :--- | :---: | :--- | :--- |
| **Environment Isolation** | ✅ | Staging vs. Production via GitHub Environments. | None. |
| **Storefront Deployment** | ✅ | Automated `wrangler deploy` in CI. | None. |
| **Backend Deployment** | ⚠️ | Likely relies on Railway's "Git Trigger". | **Gap**: Railway auto-deploys on push, potentially *before* CI passes. **Rec**: Disable Railway auto-deploy and use `railway up` in CI to ensure tests pass first. |
| **Artifact Management** | ❌ | Docker images are ephemeral (built only for tests). | **Gap**: We rebuild images in every job. **Rec**: Build Docker image once, push to registry (GHCR), then deploy *that* image to ensure immutability. |
| **Database Migrations** | ❌ | Manual or implicit. | **Gap**: Migrations should run automatically during deployment (e.g., `railway run medusa db:migrate`). |

## 3. Post-Deployment & Observability

| Component | Status | Current Implementation | Gaps / Recommendations |
| :--- | :---: | :--- | :--- |
| **Smoke Testing** | ❌ | None. | **Gap**: Verify site is actually up after deploy. **Rec**: Simple `curl` check or lightweight Playwright test against live URL. |
| **Performance Budget** | ❌ | None. | **Gap**: No check for regression in Core Web Vitals. **Rec**: Add Lighthouse CI (`lhci`). |
| **Notifications** | ❌ | GitHub UI only. | **Gap**: Team isn't alerted on failure. **Rec**: Slack/Discord webhook integration. |
| **Rollback Strategy** | ❌ | Manual via Dashboards. | **Gap**: No "One-Click Rollback" in CI. |

## Summary of Critical Gaps

1.  **Backend Deployment Control**: If Railway deploys immediately on `git push`, it bypasses your test suite. You could ship broken code to Staging/Prod even if CI fails.
2.  **Secrets Scanning**: High risk of accidental key leakage in a public/team repo.
3.  **Post-Deploy Verification**: We assume the deploy worked, but we don't verify it.

## Recommended Next Steps

1.  **Control Backend Deploy**: Add `deploy-backend` job using `railway-cli` and disable automatic git triggers in Railway.
2.  **Add Secrets Scanner**: Add `gitleaks` to the validation stage.
3.  **Add Smoke Test**: Add a simple verification step after deployment.
