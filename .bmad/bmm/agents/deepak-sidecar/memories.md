# Deepak's Memory Bank

## Bug Patterns Discovered

<!-- Deepak will add patterns here as debugging sessions occur -->
<!-- Format: ### [Date] - [Bug Category]
     - **Symptom:** What was observed
     - **Root Cause:** The actual underlying issue
     - **Solution:** How it was fixed
     - **Prevention:** How to avoid similar bugs -->

### 2025-12-06 - Docker Build Failure in Medusa Backend [RESOLVED]

- **Symptom:** Docker build fails with `npm error could not determine executable to run` (npx issue) or `npm error Missing script: "build"`.
- **Root Cause:** 
    1. `npx` resolution failure in Alpine.
    2. **Incorrect Build Context:** The build is running from the repository root, so `COPY package.json` copies the root `package.json` (which lacks the build script) instead of the backend one.
- **Solution:** 
    1. Switched to `npm run build`. 
    2. Updated Dockerfile to copy from `apps/backend/package.json` and `apps/backend` specifically, handling the root build context correctly.
- **Prevention:** When Dockerfiles are in subdirectories of a monorepo, verify the build context (Root Directory) in CI/Deployment settings. Explicit paths in Dockerfile are safer if context is Root.

### 2025-12-06 - CI Build Context Mismatch (Docker) [RESOLVED]

- **Symptom:** `failed to calculate checksum of ref ...: "/apps/backend": not found` during `COPY apps/backend .`.
- **Root Cause:** GitHub Actions workflow was running `railway up` from `working-directory: apps/backend`, effectively setting the build context to that subdirectory. The Dockerfile, however, expected a Root context (trying to copy `apps/backend` from its source).
- **Solution:** Updated `.github/workflows/ci.yml` `deploy-backend-*` jobs to use `working-directory: .` (Root). This ensures Railway uploads the full repo content as context, matching the Dockerfile structure.
- **Prevention:** Always align CI `working-directory` with the `COPY` paths in your Dockerfile. If Dockerfile uses `COPY apps/service ...`, CI **must** run from root.

## Solutions That Worked

<!-- Successful fixes and their contexts -->
<!-- Format: ### [Solution Name]
     - **Context:** When to use this solution
     - **Steps:** How to apply it
     - **Caveats:** Things to watch out for -->

## Session History

<!-- Important debugging sessions and insights -->
<!-- Format: ### [Date] - [Session Summary]
     - Key findings
     - Decisions made
     - Follow-up items -->

## Recurring Issues

<!-- Issues that keep coming back - potential systemic problems to escalate to Murat -->
<!-- Format: ### [Issue Name]
     - **Occurrences:** How many times seen
     - **Pattern:** Common trigger or conditions
     - **Recommendation:** Systemic fix needed -->
