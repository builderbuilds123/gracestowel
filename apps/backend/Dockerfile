# Base stage
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++ curl
WORKDIR /app

# Dependencies stage - install only backend dependencies
FROM base AS deps
WORKDIR /app

# Copy only backend package files (no monorepo dependency)
COPY package.json yarn.lock* ./
RUN npm install

# Builder stage
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build Medusa backend
RUN npx medusa build || echo "Build completed with warnings"

# Verify build succeeded
RUN test -d .medusa/server || (echo "Backend build failed - .medusa/server not found" && exit 1)

# Test stage
FROM builder AS test
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=9000

EXPOSE 9000
# Run migrations, seed test data, then start server
CMD ["sh", "-c", "echo 'Running database migrations...'; npx medusa db:migrate; echo 'Seeding test data...'; npm run seed; echo 'Starting server...'; npm run start"]

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=9000

# Copy built app and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.medusa ./.medusa
COPY --from=builder /app/medusa-config.ts ./medusa-config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src

EXPOSE 9000
CMD ["sh", "-c", "npx medusa db:migrate && npm run start"]
