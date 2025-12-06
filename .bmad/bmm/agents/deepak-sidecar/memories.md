# Deepak's Memory Bank

## Bug Patterns Discovered

<!-- Deepak will add patterns here as debugging sessions occur -->
<!-- Format: ### [Date] - [Bug Category]
     - **Symptom:** What was observed
     - **Root Cause:** The actual underlying issue
     - **Solution:** How it was fixed
     - **Prevention:** How to avoid similar bugs -->
### 2025-12-06 - Docker Build Failure in Medusa Backend
- **Symptom:** Docker build fails with `npm error could not determine executable to run` at `RUN npx medusa build`.
- **Root Cause:** `npx` in node:alpine container failing to resolve the `medusa` binary correctly or attempting to fetch it when it should utilize the local `@medusajs/cli` dependency.
- **Solution:** Replaced `npx medusa ...` commands with `npm run ...` scripts. Added `"migrate": "medusa db:migrate"` to `package.json` and updated Dockerfile to use `npm run build` and `npm run migrate`.
- **Prevention:** Always prefer `npm run <script>` over `npx <package>` in Dockerfiles when the package is already a dependency.

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
