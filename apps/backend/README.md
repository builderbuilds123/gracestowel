# Medusa Backend Configuration

This document explains how the Medusa V2 backend is configured for both local development and Railway deployment.

## Environment Setup

### Local Development
Uses `.env` file with Railway's **public proxy URLs**:
```bash
DATABASE_URL=postgresql://postgres:password@shuttle.proxy.rlwy.net:48905/railway
REDIS_URL=redis://default:password@shortline.proxy.rlwy.net:34142
```

### Railway Production
Uses `.env.railway` as a template. Railway automatically injects these variables using **private network**:
```bash
DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}
REDIS_URL=${{Redis.REDIS_PRIVATE_URL}}
```

> **Note:** The `${{Service.VARIABLE}}` syntax tells Railway to inject the referenced service's environment variable.

## Running Locally

1. **Install dependencies:**
   ```bash
   cd apps/backend
   npm install
   ```

2. **Run database migrations:**
   ```bash
   npx medusa migrations run
   ```

3. **Create admin user:**
   ```bash
   npx medusa user create
   ```

4. **Start the dev server:**
   ```bash
   npm run dev
   ```

   The backend will be available at:
   - **API:** http://localhost:9000
   - **Admin Dashboard:** http://localhost:9000/app

## Deploying to Railway

1. **Set Environment Variables in Railway Dashboard:**
   - Navigate to your Medusa service
   - Go to **Variables** tab
   - Add the variables from `.env.railway`
   - **IMPORTANT:** Generate secure secrets for `JWT_SECRET` and `COOKIE_SECRET`

2. **Deploy:**
   ```bash
   railway up
   ```

   Or connect your Git repository for automatic deployments.

3. **Run Migrations on Railway:**
   ```bash
   railway run npx medusa migrations run
   ```

4. **Create Admin User:**
   ```bash
   railway run npx medusa user create
   ```

## Key Configuration Files

- **`medusa-config.ts`**: Main Medusa configuration, includes Redis and database URLs
- **`.env`**: Local development environment variables (uses public proxy URLs)
- **`.env.railway`**: Template for Railway production variables (uses private network)
- **`Dockerfile`**: Multi-stage build for Railway deployment
- **`/railway.toml`** (root): Railway deployment configuration

## Private vs Public Network

- **Local Development:** Uses Railway's public proxy URLs (`shuttle.proxy.rlwy.net`, `shortline.proxy.rlwy.net`)
- **Railway Production:** Uses private network (`postgres.railway.internal`, `redis.railway.internal`)
  - Faster (no public internet)
  - More secure
  - No egress costs

## CORS Configuration

Update CORS values in Railway to match your production domains:
```bash
STORE_CORS=https://gracestowel.com,https://www.gracestowel.com
ADMIN_CORS=https://admin.gracestowel.com
AUTH_CORS=https://gracestowel.com,https://www.gracestowel.com
```
