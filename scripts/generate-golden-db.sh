#!/bin/bash
set -e

# Configuration
DB_CONTAINER_NAME="gracestowel-postgres-golden-gen"
DB_NAME="medusa-golden"
DB_USER="postgres"
DB_PASSWORD="password"
OUTPUT_FILE="docker/postgres/init/golden_state.sql"

echo "🌟 Generating Golden Database Image..."

# 1. Start a fresh Postgres container
echo "🐳 Starting temporary Postgres container..."
docker run -d --name $DB_CONTAINER_NAME \
  -e POSTGRES_PASSWORD=$DB_PASSWORD \
  -e POSTGRES_USER=$DB_USER \
  -e POSTGRES_DB=$DB_NAME \
  -p 5433:5432 \
  postgres:16-alpine

# Wait for DB to be ready
echo "⏳ Waiting for Database to be ready..."
sleep 5
until docker exec $DB_CONTAINER_NAME pg_isready -U $DB_USER; do
  echo "Waiting for Postgres..."
  sleep 2
done

# 2. Run Migrations & Seeding
echo "🌱 Running Migrations and Seeding..."
# We need to run this from the backend directory
cd apps/backend

# Set env vars to point to our temp container
export DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@localhost:5433/$DB_NAME"

# Run Medusa migrations and seed
npx medusa db:migrate
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

# 4. Cleanup
echo "🧹 Cleaning up..."
docker rm -f $DB_CONTAINER_NAME

echo "✅ Golden Database Image generated at $OUTPUT_FILE"
