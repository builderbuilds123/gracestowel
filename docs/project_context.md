---
project_name: 'gracestowel'
user_name: 'Big Dick'
date: '2025-12-05'
sections_completed: ['technology_stack', 'implementation_rules', 'infrastructure', 'architecture', 'frontend', 'testing', 'anti_patterns', 'mcp_integration']
status: 'complete'
rule_count: 30
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Runtime:** Node.js >=24 (Backend), Cloudflare Workers (Storefront)
- **Backend Framework:** Medusa v2.12.0
- **Storefront Framework:** React Router v7.10.0 (SSR), React v19.1.1
- **Language:** TypeScript v5.6+
- **Package Manager:** pnpm (monorepo with workspaces)
- **Database:** PostgreSQL (Railway), Redis (BullMQ/Cache)
- **Infrastructure:** Cloudflare Workers (Hyperdrive for DB access from Edge)
- **Key Libraries:**
  - Backend: `bullmq` (Jobs), `posthog-node` (Analytics)
  - Storefront: `tailwindcss` v4, `posthog-js`
- **MCP Servers:** Prioritize MCP servers for all external service interactions
  - **Cloudflare:** Use MCP server for Workers, KV, D1, Hyperdrive operations
  - **Stripe:** Use MCP server for payment operations and testing
  - **Railway:** Use MCP server for deployments, logs, environment management
  - **GitHub:** Use MCP server for repository operations, issues, PRs
  - **GitHub Actions:** Use MCP server for CI/CD workflows and deployments

## Critical Implementation Rules

### Infrastructure & Deployment
- **Cloudflare Workers (Storefront):**
  - 🛑 NEVER try to connect to TCP services (Postgres) directly without `hyperdrive`.
  - ✅ ALWAYS use the `env.DATABASE_URL` binding injected by Hyperdrive.
  - 🛑 DO NOT use Node.js specific APIs (fs, child_process) in Storefront execution paths.
- **Medusa Backend (Railway):**
  - ✅ Deploy as a standard Node.js service.
  - ✅ Use `medusa-config.ts` for all module configurations.

### MCP Server Integration (MANDATORY)
- **Always Check MCP First:**
  - 🛑 NEVER use direct API calls, CLI commands, or SDKs when MCP servers are available
  - ✅ ALWAYS check for and use MCP servers first for: Cloudflare, Stripe, Railway, GitHub, GitHub Actions
  - ✅ Use `list_mcp_resources()` to discover available MCP servers
  - ✅ Use `fetch_mcp_resource()` to retrieve MCP server data

- **Service-Specific MCP Usage:**
  - **Cloudflare:** Use MCP for Workers deployment, KV operations, D1 database queries, Hyperdrive configuration
  - **Stripe:** Use MCP for payment testing, webhook verification, balance checks, dispute management
  - **Railway:** Use MCP for deployments, log retrieval, environment variable management, service scaling
  - **GitHub:** Use MCP for repository management, issue/PR operations, release management, branch protection
  - **GitHub Actions:** Use MCP for workflow execution, deployment triggers, artifact management

- **Fallback Protocol:**
  - Only use direct APIs/CLIs if MCP server is unavailable or insufficient
  - Document when MCP servers are bypassed and why
  - Update this file if new MCP servers become available

### Architecture Patterns (Medusa v2)
- **Modules:** 
  - ✅ Encapsulate strictly related logic in `services` within modules.
  - 🛑 DO NOT make cross-module database calls. Use the Module API/Loader.
- **Workflows:** 
  - ✅ Use `createWorkflow` for business logic involving multiple steps.
  - ✅ Implement rollback logic for all steps.
- **Subscribers:**
  - ✅ Listen to domain events using `subscribers/`.
  - 🛑 DO NOT block the main thread; use BullMQ jobs for heavy processing.

### Frontend Patterns (React Router v7)
- **Data Loading:**
  - ✅ Use `loader` functions for server-side data fetching.
  - ✅ Use `useLoaderData` to access data in components.
- **Styling:**
  - ✅ Use Tailwind Utility classes. Avoid custom CSS files unless necessary.
  - ✅ Use `v4` syntax (no `tailwind.config.js`, configuration in CSS).

### Testing Rules
- **Backend:** `pnpm run test` (Jest). 
  - ✅ Mock all external services (Payment, Fulfillment).
- **Storefront:** `pnpm run test` (Vitest).
  - ✅ Use `happy-dom` for environment.

### Critical Anti-Patterns
- 🛑 **Never** commit `.env` files.
- 🛑 **Never** ignore errors in `catch` blocks—log them or rethrow.
- 🛑 **Never** mix Storefront and Backend types—they are distinct packages.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2025-12-12
