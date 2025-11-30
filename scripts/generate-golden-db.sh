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

# 1. Start a fresh Postgres container with host networking for CI compatibility
echo "🐳 Starting temporary Postgres container..."
# Use --network=host in CI for reliable connectivity, otherwise use port mapping
if [ "$CI" = "true" ]; then
  echo "Running in CI mode with host networking..."
  # With host networking, postgres listens directly on host's port 5433
  docker run -d --name $DB_CONTAINER_NAME \
    --network=host \
    -e POSTGRES_PASSWORD=$DB_PASSWORD \
    -e POSTGRES_USER=$DB_USER \
    -e POSTGRES_DB=$DB_NAME \
    postgres:16-alpine \
    -c port=5433
  HOST_PORT=5433
  CONTAINER_PORT=5433
else
  # Standard port mapping: host:5433 -> container:5432
  docker run -d --name $DB_CONTAINER_NAME \
    -e POSTGRES_PASSWORD=$DB_PASSWORD \
    -e POSTGRES_USER=$DB_USER \
    -e POSTGRES_DB=$DB_NAME \
    -p 5433:5432 \
    postgres:16-alpine
  HOST_PORT=5433
  CONTAINER_PORT=5432
fi

# Wait for DB to be ready - more robust check
echo "⏳ Waiting for Database to be ready..."
for i in {1..30}; do
  # Use container port for commands inside container
  if docker exec $DB_CONTAINER_NAME pg_isready -U $DB_USER -d $DB_NAME -p $CONTAINER_PORT > /dev/null 2>&1; then
    # Also verify we can actually connect and run a query
    if docker exec $DB_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -p $CONTAINER_PORT -c "SELECT 1" > /dev/null 2>&1; then
      echo "✓ Database is ready (container port: $CONTAINER_PORT)"
      break
    fi
  fi
  echo "Waiting for Postgres... ($i/30)"
  sleep 2
done

# Verify database is truly ready
if ! docker exec $DB_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -p $CONTAINER_PORT -c "SELECT 1" > /dev/null 2>&1; then
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

# Set env vars to point to our temp container - use HOST_PORT for connection from host
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:$HOST_PORT/$DB_NAME"
echo "Using DATABASE_URL: postgresql://$DB_USER:****@127.0.0.1:$HOST_PORT/$DB_NAME"

# Test connection from host using psql if available
echo "Testing database connection from host..."
if command -v psql &> /dev/null; then
  if PGPASSWORD=$DB_PASSWORD psql -h 127.0.0.1 -p $HOST_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
    echo "✓ Host can connect to database"
  else
    echo "⚠️ Host psql connection failed, checking Docker networking..."
    docker network ls
    docker inspect $DB_CONTAINER_NAME | grep -A 20 "NetworkSettings"
  fi
else
  echo "psql not available on host, skipping connection test"
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

# Dump structure and data - use CONTAINER_PORT for commands inside container
# --clean: Include DROP commands
# --if-exists: Use IF EXISTS
# --no-owner: Don't output commands to set ownership
# --no-acl: Don't output privileges
docker exec $DB_CONTAINER_NAME pg_dump -U $DB_USER -d $DB_NAME -p $CONTAINER_PORT --clean --if-exists --no-owner --no-acl > $OUTPUT_FILE

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
