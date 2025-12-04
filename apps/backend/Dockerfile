# Base stage
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++ curl
WORKDIR /app

# Builder stage - single stage for dependencies and build
FROM base AS builder
WORKDIR /app

# Copy package.json first for layer caching
COPY package.json ./

# Install ALL dependencies (production + dev) for the build
# Legacy peer deps needed for some Medusa packages
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build Medusa backend using npx to ensure CLI is found
RUN npx medusa build

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
ENV HOST=0.0.0.0

# Copy built app and dependencies
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.medusa ./.medusa
COPY --from=builder --chown=node:node /app/.medusa/server/public ./.medusa/server/public
COPY --from=builder --chown=node:node /app/medusa-config.ts ./medusa-config.ts
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/src ./src

USER node

EXPOSE 9000
CMD ["sh", "-c", "echo 'Listing .medusa directory:' && ls -R .medusa && npx medusa db:migrate && npm run start"]
