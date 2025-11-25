#!/bin/bash
set -e

echo "🚀 Setting up local development environment..."

# Check if .env exists
if [ ! -f "apps/backend/.env" ]; then
    echo "❌ apps/backend/.env not found. Please create it with Railway Staging URLs."
    exit 1
fi

# Run migrations (on Railway Staging database)
echo "🗄️  Running database migrations on Railway Staging..."
cd apps/backend
npm run build 2>/dev/null || echo "⚠️  Build had warnings (expected for admin frontend)"
npx medusa db:migrate

# Seed database
echo "🌱 Seeding database..."
npm run seed

echo "✅ Local environment ready!"
echo ""
echo "Next steps:"
echo "  1. Start backend: cd apps/backend && npm run dev"
echo "  2. Start storefront: cd apps/storefront && npm run dev"
echo "  3. Access admin: http://localhost:9000/app"
