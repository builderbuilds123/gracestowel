#!/bin/bash
set -e

# Configuration
DB_CONTAINER_NAME="gracestowel-postgres-golden-gen"
DB_NAME="medusa_golden"
DB_USER="postgres"
DB_PASSWORD="password"
OUTPUT_FILE="docker/postgres/init/golden_state.sql"

echo "🌟 Generating Golden Database Image..."

# Cleanup any existing container
docker rm -f $DB_CONTAINER_NAME 2>/dev/null || true

# 1. Start a fresh Postgres container
echo "🐳 Starting temporary Postgres container..."
docker run -d --name $DB_CONTAINER_NAME \
  -e POSTGRES_PASSWORD=$DB_PASSWORD \
  -e POSTGRES_USER=$DB_USER \
  -e POSTGRES_DB=$DB_NAME \
  -p 5433:5432 \
  postgres:16-alpine

# Wait for DB to be ready - more robust check
echo "⏳ Waiting for Database to be ready..."
for i in {1..30}; do
  if docker exec $DB_CONTAINER_NAME pg_isready -U $DB_USER -d $DB_NAME > /dev/null 2>&1; then
    # Also verify we can actually connect and run a query
    if docker exec $DB_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
      echo "✓ Database is ready"
      break
    fi
  fi
  echo "Waiting for Postgres... ($i/30)"
  sleep 2
done

# Verify database is truly ready
if ! docker exec $DB_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
  echo "❌ Database failed to become ready after 60 seconds"
  docker logs $DB_CONTAINER_NAME
  exit 1
fi

# Extra delay to ensure Postgres is fully initialized
sleep 3

# 2. Run Migrations & Seeding
echo "🌱 Running Migrations and Seeding..."
# We need to run this from the backend directory
cd apps/backend

# Set env vars to point to our temp container via mapped port
# Using 127.0.0.1 and the mapped port 5433 for host-to-container communication
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5433/$DB_NAME"
echo "Using DATABASE_URL: postgresql://$DB_USER:****@127.0.0.1:5433/$DB_NAME"

# Test connection first
echo "Testing database connection..."
if ! npx medusa db:sync --dry-run 2>&1 | head -5; then
  echo "⚠️ db:sync test had issues, trying migration anyway..."
fi

# Run Medusa migrations and seed
echo "Running migrations..."
npx medusa db:migrate

echo "Running seed script..."
npx medusa exec ./src/scripts/seed.ts

cd ../..

# 3. Dump the Database
echo "💾 Dumping database state to $OUTPUT_FILE..."
mkdir -p $(dirname $OUTPUT_FILE)

# Dump structure and data
# --clean: Include DROP commands
# --if-exists: Use IF EXISTS
# --no-owner: Don't output commands to set ownership
# --no-acl: Don't output privileges
docker exec $DB_CONTAINER_NAME pg_dump -U $DB_USER -d $DB_NAME --clean --if-exists --no-owner --no-acl > $OUTPUT_FILE

# Verify dump was created
if [ ! -s "$OUTPUT_FILE" ]; then
  echo "❌ Database dump failed - file is empty"
  exit 1
fi

echo "📊 Dump file size: $(du -h $OUTPUT_FILE | cut -f1)"

# 4. Cleanup
echo "🧹 Cleaning up..."
docker rm -f $DB_CONTAINER_NAME

echo "✅ Golden Database Image generated at $OUTPUT_FILE"
