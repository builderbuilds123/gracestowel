# Base stage
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++ curl
WORKDIR /app

# Builder stage - single stage for dependencies and build
FROM base AS builder
WORKDIR /app

# Copy package.json from apps/backend assuming root build context
COPY apps/backend/package.json ./

# Install ALL dependencies (production + dev) for the build
# Legacy peer deps needed for some Medusa packages
RUN npm install --legacy-peer-deps

# Copy source code from apps/backend
COPY apps/backend .

# Build Medusa backend using npm run build to reliably use local CLI
RUN npm run build

# Test stage
FROM builder AS test
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
# Run migrations, seed test data, then start server
CMD ["sh", "-c", "echo 'Running database migrations...'; npm run migrate; echo 'Seeding test data...'; npm run seed; echo 'Starting server...'; npm run start"]

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Copy built app and dependencies
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.medusa ./.medusa
COPY --from=builder --chown=node:node /app/.medusa/server/public ./public
COPY --from=builder --chown=node:node /app/medusa-config.ts ./medusa-config.ts
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/src ./src

USER node

# Railway sets PORT=8080 by default, which the app uses via ${PORT:-8080}
# No EXPOSE needed as Railway handles port mapping
CMD ["sh", "-c", "echo 'Current NODE_ENV: $NODE_ENV'; if [ -f public/admin/index.html ]; then echo 'FOUND index.html'; else echo 'MISSING index.html at public/admin/index.html'; echo 'Listing directories:'; ls -R public; exit 1; fi; npm run migrate && npm run start"]
