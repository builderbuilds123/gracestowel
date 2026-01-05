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

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["sh", "-c", "echo 'Running database migrations...'; pnpm run migrate; echo 'Seeding test data...'; pnpm run seed; echo 'Starting server...'; pnpm run start"]

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
