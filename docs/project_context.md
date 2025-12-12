---
project_name: 'gracestowel'
user_name: 'Big Dick'
date: '2025-12-05'
sections_completed: ['technology_stack', 'implementation_rules', 'infrastructure', 'architecture', 'frontend', 'testing', 'anti_patterns']
status: 'complete'
rule_count: 23
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

## Critical Implementation Rules

### Infrastructure & Deployment
- **Cloudflare Workers (Storefront):** 
  - 🛑 NEVER try to connect to TCP services (Postgres) directly without `hyperdrive`.
  - ✅ ALWAYS use the `env.DATABASE_URL` binding injected by Hyperdrive.
  - 🛑 DO NOT use Node.js specific APIs (fs, child_process) in Storefront execution paths.
- **Medusa Backend (Railway):**
  - ✅ Deploy as a standard Node.js service.
  - ✅ Use `medusa-config.ts` for all module configurations.

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

Last Updated: 2025-12-11
