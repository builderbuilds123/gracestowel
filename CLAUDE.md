# Claude Code Review Guidelines for Grace's Towel

## Project Overview

Grace's Towel is an e-commerce platform for premium Turkish cotton towels, built as a monorepo with:

- **Monorepo Tool**: pnpm workspaces + Turbo
- **Backend**: Medusa v2 (Node.js headless commerce)
- **Storefront**: React Router v7 + Cloudflare Workers
- **Database**: PostgreSQL + Redis
- **Infrastructure**: Railway + Cloudflare
- **Node Version**: >=24

## Code Review Focus Areas

### 1. Architecture & Patterns

- **API-Only Data Access**: Storefront uses Medusa API for reads and writes
- **Monorepo Structure**: Code should be in the appropriate workspace (`apps/backend`, `apps/storefront`, `apps/e2e`)
- **Separation of Concerns**: Backend handles business logic, storefront handles presentation
- **Edge-First**: Storefront runs on Cloudflare Workers, so avoid Node.js-specific APIs

### 2. Code Quality

- **TypeScript**: All code must be strongly typed. Avoid `any` types
- **Error Handling**: Use proper error handling with try/catch and meaningful error messages
- **Async/Await**: Prefer async/await over Promise chains
- **Naming Conventions**:
  - camelCase for variables and functions
  - PascalCase for components and classes
  - UPPER_SNAKE_CASE for constants and environment variables

### 3. Backend (Medusa v2)

- **Service Layer**: Business logic belongs in services, not routes
- **Database Access**: Use Medusa's repository pattern
- **Transactions**: Use database transactions for multi-step operations
- **Validation**: Validate all input data
- **API Responses**: Return consistent response formats
- **Error Handling**: Use proper HTTP status codes

### 4. Frontend (React Router v7)

- **Components**: Keep components focused and reusable
- **Hooks**: Use custom hooks for shared logic
- **State Management**: Use React Router loaders/actions for server state
- **Performance**:
  - Avoid unnecessary re-renders
  - Use lazy loading for code splitting
  - Optimize images and assets
- **Edge Compatibility**: Code must run on Cloudflare Workers (no Node.js APIs)

### 5. Testing

- **Coverage**: All new features should have tests
- **Test Types**:
  - Unit tests for business logic
  - Integration tests for API endpoints
  - E2E tests for critical user flows
- **Test Structure**: Follow AAA pattern (Arrange, Act, Assert)
- **Test Files**: Co-locate tests with source files (`.test.ts` or `.spec.ts`)

### 6. Security

- **Input Validation**: Sanitize and validate all user inputs
- **SQL Injection**: Use parameterized queries
- **XSS Prevention**: Escape output appropriately
- **Authentication**: Check auth on all protected routes
- **Environment Variables**: Never commit secrets, use `.env` files
- **Dependencies**: Keep dependencies updated, check for vulnerabilities

### 7. Performance

- **Database Queries**:
  - Avoid N+1 queries
  - Use indexes appropriately
  - Limit result sets
- **Caching**: Use Redis for frequently accessed data
- **API Calls**: Minimize external API calls, use batching when possible
- **Bundle Size**: Keep bundle sizes small for edge deployment

### 8. Common Issues to Flag

- Missing error handling
- Unvalidated inputs
- Hardcoded values that should be configurable
- Inefficient database queries
- Missing tests for new functionality
- Type safety issues (`any`, missing types)
- Security vulnerabilities
- Breaking changes without migration plan
- Missing documentation for complex logic

### 9. Pull Request Checklist

When reviewing PRs, verify:

- [ ] Code follows TypeScript best practices
- [ ] Tests are included and passing
- [ ] No console.log or debugging code left in
- [ ] Environment variables are documented
- [ ] Database migrations are included (if schema changes)
- [ ] Error handling is comprehensive
- [ ] Security considerations are addressed
- [ ] Performance impact is considered
- [ ] Documentation is updated (if needed)

### 10. Feedback Style

- Be constructive and specific
- Explain the "why" behind suggestions
- Offer code examples when helpful
- Distinguish between required changes and suggestions
- Acknowledge good practices when you see them

## Commit Rules

**IMPORTANT:** Before completing any task, you MUST run `/commit-smart` to commit your changes.

- Only commit files YOU modified in this session — never commit unrelated changes
- Use atomic commits with descriptive messages following conventional commits format:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `refactor:` for code refactoring
  - `test:` for adding tests
  - `docs:` for documentation changes
  - `chore:` for maintenance tasks
- If there are no changes to commit, skip this step
- Do not push unless explicitly asked
- Always include Co-Authored-By trailer: `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`

## Task Tracking

This project uses a **dual tracking system**:

### 1. Sprint Status (Strategic Planning)
- **File**: `docs/sprint/sprint-artifacts/sprint-status.yaml`
- **Purpose**: Comprehensive epic and story tracking across product lifecycle
- **Commands**: `/sprint-status`, `/sprint-planning`, `/dev-story`
- **Format**: YAML with dependencies, metadata, and retrospectives

### 2. Active Work Tracker (Tactical Execution)
- **File**: `SPRINT.md` (root level)
- **Purpose**: Daily task tracking for current Claude Code session
- **Usage**: Updated during active development work
- **Format**: Markdown checklist with task IDs referencing stories

**Workflow**:
1. Check `sprint-status.yaml` for story status and dependencies
2. Add active tasks to `SPRINT.md` referencing the story ID
3. Update `SPRINT.md` as you complete tasks
4. Commit with `/commit-smart` when task is done
5. Update story status in `sprint-status.yaml` when story is complete

## Server Process Management

**IMPORTANT:** Before starting any development server, always clean up existing processes:

```bash
# Kill existing processes on common ports before starting servers
lsof -ti:5173 | xargs kill -9 2>/dev/null  # Storefront
lsof -ti:9000 | xargs kill -9 2>/dev/null  # Backend API
lsof -ti:9001 | xargs kill -9 2>/dev/null  # Stripe webhook forwarding
```

### Stripe Webhook Tunneling

**CRITICAL:** For checkout testing, ensure Stripe CLI is forwarding webhooks:

```bash
# Check if Stripe CLI is forwarding webhooks
stripe listen --forward-to localhost:9000/webhooks/stripe

# Or use the convenience script
pnpm stripe:listen
```

Without webhook forwarding, checkout completion will fail because Medusa won't receive payment confirmations.

### Writing Logs to Temp Directory

**ALWAYS write logs to temp files when starting servers.** This enables agents and developers to inspect logs for debugging:

```bash
# ALWAYS start servers with logs persisted to temp directory
pnpm dev:api 2>&1 | tee /tmp/gracestowel-api.log
pnpm dev:storefront 2>&1 | tee /tmp/gracestowel-storefront.log

# Check logs in real-time
tail -f /tmp/gracestowel-api.log
tail -f /tmp/gracestowel-storefront.log

# Check recent log entries
tail -100 /tmp/gracestowel-storefront.log
```

The log files persist across restarts, making it easy to review what happened during a session.

## Logging Guidelines

**NEVER use `console.log`, `console.warn`, or `console.error` directly unless specifically instructed.**

Always use the structured logger from `apps/storefront/app/lib/logger.ts`:

```typescript
import { createLogger, getTraceIdFromRequest } from "../lib/logger";

// In route handlers - use trace ID from request for correlation
const traceId = getTraceIdFromRequest(request);
const logger = createLogger({ traceId, context: "my-route" });

// In other modules - just use context
const logger = createLogger({ context: "my-module" });

// Log with structured data
logger.info("Operation completed", { orderId, cartId, customerId });
logger.warn("Potential issue detected", { reason, details });
logger.error("Operation failed", error, { context: "additional-info" });
```

**Why structured logging?**
- Trace IDs enable request correlation across services
- JSON format enables log aggregation and search
- Consistent format makes debugging easier
- No sensitive data accidentally logged

## Commands

Common development commands for this monorepo:

**Development:**
- `pnpm dev:storefront` - Run storefront dev server
- `pnpm dev:api` - Run API backend
- `pnpm dev:background` - Run background worker

**Testing:**
- `pnpm test` - Run all tests
- `pnpm test:storefront` - Run storefront tests
- `pnpm test:backend` - Run backend integration tests
- `pnpm test:e2e` - Run E2E tests
- `pnpm test:e2e:ui` - Run E2E tests with UI

**Building:**
- `pnpm build` - Build all apps
- `pnpm lint` - Lint all code
- `pnpm typecheck` - Type check all code

**Deployment:**
- `pnpm deploy:storefront` - Deploy storefront
- `pnpm deploy:api` - Deploy API backend
- `pnpm deploy:background` - Deploy background worker
