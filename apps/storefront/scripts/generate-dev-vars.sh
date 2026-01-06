#!/bin/sh
# Generate .dev.vars file from environment variables for Wrangler
# This ensures Wrangler can access MEDUSA_BACKEND_URL in Docker test environment

mkdir -p /app/dist/server
cat > /app/dist/server/.dev.vars << EOF
MEDUSA_BACKEND_URL=${MEDUSA_BACKEND_URL:-http://backend:8080}
MEDUSA_PUBLISHABLE_KEY=${MEDUSA_PUBLISHABLE_KEY:-}
EOF

exec "$@"

