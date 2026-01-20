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

- **Hybrid Data Access**: Storefront uses Hyperdrive for read-only operations and REST API for write operations
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
