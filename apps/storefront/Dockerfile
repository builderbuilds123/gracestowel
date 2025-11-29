# Base stage
FROM node:20-slim AS base
# RUN apk add --no-cache libc6-compat # Not needed for Debian-based slim image
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy package files and wrangler config (required for postinstall typegen)
COPY package.json wrangler.toml wrangler.jsonc ./
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

# Test stage
FROM base AS test
WORKDIR /app

ENV NODE_ENV=development
ENV PORT=5173

# Copy dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173

# Copy built app and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

EXPOSE 5173
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
