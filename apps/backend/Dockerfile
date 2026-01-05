# Base stage
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++ curl

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /repo

# Dependencies stage (pnpm workspace, single lockfile at repo root)
FROM base AS deps

# Copy root workspace manifests first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json ./apps/backend/package.json

# Install only backend deps (and their transitive deps), excluding workspace root.
# This avoids pulling in repo-root tooling deps (e.g. @railway/cli) during image builds.
RUN pnpm install --frozen-lockfile --filter @gracestowel/backend... --filter '!gracestowel-monorepo'

# Dev stage (for docker-compose)
FROM deps AS dev

COPY apps/backend ./apps/backend

WORKDIR /repo/apps/backend
ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=9000

EXPOSE 9000
CMD ["pnpm", "run", "dev"]

# Builder stage
FROM base AS builder

# Bring in installed deps
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/backend/node_modules /repo/apps/backend/node_modules

# Copy backend source
COPY apps/backend ./apps/backend

WORKDIR /repo/apps/backend
RUN pnpm run build

# Create a self-contained deployment (resolves all symlinks)
# --legacy required for pnpm v10+ without inject-workspace-packages
RUN pnpm --filter @gracestowel/backend deploy --prod --legacy /deploy

# Test stage
FROM builder AS test
WORKDIR /repo/apps/backend

# Install postgres client and netcat for health checks
RUN apk add --no-cache postgresql-client netcat-openbsd

# Ensure we use the node_modules from builder stage for all commands
# The builder stage has all dependencies properly installed
ENV NODE_ENV=production
ENV PORT=8080
# Set NODE_PATH to help with module resolution in pnpm workspaces
ENV NODE_PATH=/repo/node_modules:/repo/apps/backend/node_modules

EXPOSE 8080
# Wait for DB, run migrations, seed, and start server
# Use pnpm exec to run medusa commands with proper module resolution
CMD ["sh", "-c", "echo 'Waiting for database to be ready...'; until pg_isready -h postgres -U medusa_test -d medusa_test 2>/dev/null || nc -z postgres 5432 2>/dev/null; do echo 'Waiting for postgres...'; sleep 2; done; echo 'Database is ready'; echo 'Running database migrations...'; cd /repo/apps/backend && pnpm exec medusa db:migrate; echo 'Seeding test data...'; pnpm exec medusa exec ./src/scripts/seed.ts || echo 'Seed completed or skipped'; echo 'Starting server...'; pnpm exec medusa start --host 0.0.0.0 --port 8080"]

# Production image
FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Copy self-contained deployment from pnpm deploy (no symlinks)
COPY --from=builder --chown=node:node /deploy/node_modules ./node_modules
COPY --from=builder --chown=node:node /deploy/package.json ./package.json
# Copy built app artifacts from .medusa/server (all compiled JS)
COPY --from=builder --chown=node:node /repo/apps/backend/.medusa ./.medusa
COPY --from=builder --chown=node:node /repo/apps/backend/.medusa/server/public ./public
COPY --from=builder --chown=node:node /repo/apps/backend/.medusa/server/medusa-config.js ./medusa-config.js
COPY --from=builder --chown=node:node /repo/apps/backend/.medusa/server/src ./src

USER node

# Railway sets PORT=8080 by default, which the app uses via ${PORT:-8080}
CMD ["sh", "-c", "node node_modules/@medusajs/cli/cli.js db:migrate && node node_modules/@medusajs/cli/cli.js start"]
