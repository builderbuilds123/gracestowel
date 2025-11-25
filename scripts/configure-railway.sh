#!/bin/bash

# Generate secure secrets
JWT_SECRET=$(openssl rand -hex 32)
COOKIE_SECRET=$(openssl rand -hex 32)

echo "Generated JWT_SECRET and COOKIE_SECRET."

# Define other variables
NODE_ENV="production"
STORE_CORS="https://gracestowel.com"
ADMIN_CORS="https://admin.gracestowel.com"
AUTH_CORS="https://gracestowel.com,https://admin.gracestowel.com"

echo "Setting environment variables on Railway..."

# Set variables using Railway CLI
npx railway variables \
  --set "NODE_ENV=$NODE_ENV" \
  --set "JWT_SECRET=$JWT_SECRET" \
  --set "COOKIE_SECRET=$COOKIE_SECRET" \
  --set "STORE_CORS=$STORE_CORS" \
  --set "ADMIN_CORS=$ADMIN_CORS" \
  --set "AUTH_CORS=$AUTH_CORS"

echo "Environment variables configured successfully!"
echo "Note: DATABASE_URL and REDIS_URL should be automatically provided by your Railway Postgres and Redis services."
