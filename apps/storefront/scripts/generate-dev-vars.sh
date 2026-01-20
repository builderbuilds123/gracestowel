#!/bin/sh
# Generate .dev.vars file from environment variables for Wrangler
# This ensures Wrangler can access MEDUSA_BACKEND_URL in Docker test environment

mkdir -p /app/dist/server
cat > /app/dist/server/.dev.vars << EOF
MEDUSA_BACKEND_URL=${MEDUSA_BACKEND_URL:-http://backend:8080}
MEDUSA_PUBLISHABLE_KEY=${MEDUSA_PUBLISHABLE_KEY:-}
JWT_SECRET=${JWT_SECRET:-test-secret-must-be-at-least-32-characters-long-for-security}
STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLISHABLE_KEY:-}
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}
EOF

exec "$@"

