#!/bin/sh
# Generate .dev.vars file from environment variables for Wrangler
# This ensures Wrangler can access environment variables in Docker test environment

mkdir -p /app/dist/server

# Generate .dev.vars file with all required environment variables
# Wrangler looks for .dev.vars in the config file's directory (dist/server/)
cat > /app/dist/server/.dev.vars << EOF
ENVIRONMENT=${ENVIRONMENT:-development}
CI=${CI:-true}
MEDUSA_BACKEND_URL=${MEDUSA_BACKEND_URL:-http://backend:8080}
MEDUSA_PUBLISHABLE_KEY=${MEDUSA_PUBLISHABLE_KEY:-}
JWT_SECRET=${JWT_SECRET:-test-secret-must-be-at-least-32-characters-long-for-security}
JWE_SECRET=${JWE_SECRET:-test-secret-must-be-at-least-32-characters-long-for-security}
STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLISHABLE_KEY:-pk_test_placeholder_for_ci}
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-sk_test_placeholder_for_ci}
VITE_POSTHOG_API_KEY=${VITE_POSTHOG_API_KEY:-ph_test_placeholder_for_ci}
VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST:-https://us.i.posthog.com}
EOF

# Disable hyperdrive for CI by patching the wrangler.json
# Hyperdrive requires Cloudflare's proxy and doesn't work in local Docker
if [ -f /app/dist/server/wrangler.json ]; then
  # Use node to patch the JSON (more reliable than sed for JSON)
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('/app/dist/server/wrangler.json', 'utf8'));
    config.hyperdrive = [];
    fs.writeFileSync('/app/dist/server/wrangler.json', JSON.stringify(config, null, 2));
  "
  echo 'Patched wrangler.json to disable hyperdrive for CI'
fi

exec "$@"

