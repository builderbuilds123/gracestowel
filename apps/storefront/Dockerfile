# Base stage
FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /repo

# Dependencies stage (pnpm workspace, single lockfile at repo root)
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/storefront/package.json ./apps/storefront/package.json
COPY apps/storefront/wrangler.jsonc ./apps/storefront/wrangler.jsonc

# Skip typegen/postinstall in Docker builds
ENV CI=true
# Install only storefront deps (and their transitive deps), excluding workspace root.
# This avoids pulling in repo-root tooling deps (e.g. @railway/cli) during image builds.
RUN pnpm install --frozen-lockfile --filter apps-storefront... --filter '!gracestowel-monorepo'

# Dev stage (for docker-compose)
FROM deps AS dev

# Do not treat runtime as CI
ENV CI=false
ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=5173

COPY apps/storefront ./apps/storefront

WORKDIR /repo/apps/storefront
EXPOSE 5173
CMD ["pnpm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# Builder stage
FROM base AS builder

COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/storefront/node_modules /repo/apps/storefront/node_modules

COPY apps/storefront ./apps/storefront

WORKDIR /repo/apps/storefront
RUN pnpm run build

# Test stage - uses builder output since wrangler dev needs the server build
FROM base AS test
WORKDIR /app

ENV NODE_ENV=development
ENV PORT=5173
ENV HOST=0.0.0.0

COPY --from=builder /repo/apps/storefront/node_modules ./node_modules
COPY --from=builder /repo/apps/storefront/dist ./dist
COPY --from=builder /repo/apps/storefront/package.json ./package.json
COPY --from=builder /repo/apps/storefront/public ./public

RUN ln -s /app/node_modules /app/dist/server/node_modules

EXPOSE 5173
CMD ["pnpm", "run", "test:server"]

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173

COPY --from=builder --chown=node:node /repo/apps/storefront/node_modules ./node_modules
COPY --from=builder --chown=node:node /repo/apps/storefront/dist ./dist
COPY --from=builder --chown=node:node /repo/apps/storefront/package.json ./package.json
COPY --from=builder --chown=node:node /repo/apps/storefront/public ./public

USER node

EXPOSE 5173
CMD ["pnpm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
