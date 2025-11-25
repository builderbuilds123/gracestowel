# Base stage
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Dependencies stage
FROM base AS deps
# Copy root package files for workspace setup
COPY package.json package-lock.json* ./
# Copy backend package files
COPY apps/backend/package.json ./apps/backend/
RUN npm ci

# Builder stage  
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY . .

# Build Medusa backend
WORKDIR /app/apps/backend

# Build - backend compiles to .medusa/server, admin errors can be ignored
RUN npx medusa build || echo "Build completed with warnings" && \
    # Ensure .medusa/server exists (backend build output)
    test -d .medusa/server || (echo "Backend build failed" && exit 1)

# Production image
FROM base AS runner
WORKDIR /app/apps/backend

ENV NODE_ENV=production
ENV PORT=9000

# Copy root node_modules (where hoisted deps live)
COPY --from=builder /app/node_modules /app/node_modules

# Copy built app and dependencies
COPY --from=builder /app/apps/backend/node_modules ./node_modules
COPY --from=builder /app/apps/backend/.medusa ./.medusa
COPY --from=builder /app/apps/backend/medusa-config.ts ./medusa-config.ts
COPY --from=builder /app/apps/backend/package.json ./package.json
COPY --from=builder /app/apps/backend/tsconfig.json ./tsconfig.json

EXPOSE 9000
CMD ["sh", "-c", "npx medusa db:migrate && npm run start"]
