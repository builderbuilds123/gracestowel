# Base stage
FROM node:24-slim AS base
# RUN apk add --no-cache libc6-compat # Not needed for Debian-based slim image
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy package files and wrangler config (required for postinstall typegen)
COPY package.json wrangler.jsonc ./
# Set CI=true to skip wrangler types in postinstall (workerd binary incompatible with Alpine)
ENV CI=true
RUN npm install

# Builder stage
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Test stage - uses builder output since wrangler dev needs the server build
FROM base AS test
WORKDIR /app

ENV NODE_ENV=development
ENV PORT=5173
ENV HOST=0.0.0.0

# Copy built app and dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

# Create symlink so wrangler can be found from build/server directory
RUN ln -s /app/node_modules /app/build/server/node_modules

EXPOSE 5173
CMD ["npm", "run", "test:server"]

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173

# Copy built app and dependencies
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 5173
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
