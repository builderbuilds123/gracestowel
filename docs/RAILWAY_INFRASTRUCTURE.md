# Railway Infrastructure Documentation

## Overview

This document serves as the source of truth for the gracestowel Railway infrastructure. Railway provides managed PostgreSQL and Redis instances, with the Medusa backend deployed as a containerized service.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Railway Platform                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐         ┌─────────────────┐      │
│  │   Production    │         │    Staging      │      │
│  │   Environment   │         │   Environment   │      │
│  ├─────────────────┤         ├─────────────────┤      │
│  │ • PostgreSQL    │         │ • PostgreSQL    │      │
│  │ • Redis         │         │ • Redis         │      │
│  │ • Medusa Server │         │ (local dev)     │      │
│  └─────────────────┘         └─────────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Environments

### 🚀 Production Environment

**Purpose:** Live customer-facing services

| Service | Type | Internal URL | External URL | Notes |
|---------|------|--------------|--------------|-------|
| PostgreSQL | Managed Database | `postgres.railway.internal:5432` | `shuttle.proxy.rlwy.net:48905` | Auto-managed by Railway |
| Redis | Managed Cache | (internal) | `shortline.proxy.rlwy.net:34142` | Session & cache storage |
| Medusa Backend | Container | (auto-assigned) | `medusa-backend.up.railway.app` | Deployed via Dockerfile |

**Environment Variables (set in Railway dashboard):**
```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}  # Injected by Railway
REDIS_URL=${{Redis.REDIS_URL}}           # Injected by Railway
STORE_CORS=https://gracestowel.com
ADMIN_CORS=https://admin.gracestowel.com
JWT_SECRET=<production-secret>
COOKIE_SECRET=<production-secret>
NODE_ENV=production
```

### 🧪 Staging Environment

**Purpose:** Shared development environment for team collaboration

| Service | Type | Internal URL | External URL | Notes |
|---------|------|--------------|--------------|-------|
| PostgreSQL | Managed Database | N/A | `ballast.proxy.rlwy.net:59508` | Used by local dev |
| Redis | Managed Cache | N/A | `switchyard.proxy.rlwy.net:24084` | Used by local dev |

**Usage:** Staging databases are accessed from local development environments only (no deployed services).

**Credentials:** Stored in:
- `apps/backend/.env` (local Medusa)
- `apps/storefront/.dev.vars` (local Remix)

## Deployment Configuration

### Backend Service (Production)

Defined in [`railway.toml`](file:///Users/leonliang/Github%20Repo/gracestowel/railway.toml):

```toml
[build]
builder = "dockerfile"
dockerfilePath = "apps/backend/Dockerfile"

[deploy]
startCommand = "npm run start"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
```

**Build Process:**
1. Railway pulls latest `main` branch
2. Builds Docker image using `apps/backend/Dockerfile`
3. Runs migrations: `npx medusa db:migrate`
4. Starts server: `npm run start`

**Health Check:** Railway pings `/health` endpoint to verify service health

### Storefront (Cloudflare Workers)

Not deployed on Railway. Deployed to Cloudflare Workers via:
```bash
cd apps/storefront
npm run deploy  # wrangler deploy
```

## Database Schema Management

### Migrations

**Location:** Managed by Medusa ORM (automatically generated)

**Running Migrations:**

**Production:**
```bash
# Auto-runs on deployment (see Dockerfile CMD)
npx medusa db:migrate && npm run start
```

**Staging:**
```bash
# Run locally with staging credentials
cd apps/backend
npm run dev  # Auto-runs migrations on start
```

**Manual migration (if needed):**
```bash
cd apps/backend
npx medusa db:migrate
```

## Connection Details

### Internal URLs (Railway Private Network)

Used **only within Railway** (e.g., Medusa backend container → PostgreSQL):
- PostgreSQL: `postgres.railway.internal:5432`
- Format: `postgresql://postgres:<password>@postgres.railway.internal:5432/railway`

### External URLs (TCP Proxy)

Used for **local development** and **external connections**:
- Production PostgreSQL: `shuttle.proxy.rlwy.net:48905`
- Production Redis: `shortline.proxy.rlwy.net:34142`
- Staging PostgreSQL: `ballast.proxy.rlwy.net:59508`
- Staging Redis: `switchyard.proxy.rlwy.net:24084`

> ⚠️ **Security Note:** External URLs are protected by Railway's authentication. Credentials rotate automatically on regeneration.

## Infrastructure Replication

### Creating a New Environment

If you need to replicate this infrastructure (e.g., for a new staging environment):

1. **Create Railway Project:**
   ```bash
   railway login
   railway init
   ```

2. **Add PostgreSQL:**
   - Railway Dashboard → New → Database → PostgreSQL
   - Copy external connection URL

3. **Add Redis:**
   - Railway Dashboard → New → Database → Redis
   - Copy external connection URL

4. **Deploy Medusa Backend (production only):**
   - Connect GitHub repository
   - Set root directory to `apps/backend`
   - Railway auto-detects `railway.toml`
   - Set environment variables in dashboard

5. **Run Initial Migration:**
   ```bash
   # Automatically runs on first deploy via Dockerfile
   # Or manually trigger:
   railway run npx medusa db:migrate
   ```

## Cost Estimate

**Railway Hobby Plan:** $5/month base

**Estimated Monthly Costs:**
- Production PostgreSQL: ~$5-10/month (usage-based)
- Production Redis: ~$2-5/month
- Staging PostgreSQL: ~$2-3/month
- Staging Redis: ~$1-2/month
- **Total: ~$15-25/month**

> 💡 **Optimization:** Staging environment only runs databases (no compute), keeping costs low.

## Monitoring & Logs

**Access Logs:**
```bash
railway logs --service medusa-backend
```

**Dashboard:** [Railway Dashboard](https://railway.app/dashboard)

**Health Check:** Monitor `/health` endpoint uptime in Railway dashboard

## Backup & Recovery

**Automatic Backups:**
- Railway automatically backs up PostgreSQL databases
- Retention: 7 days (Hobby plan)

**Manual Backup:**
```bash
# Export production database
railway run pg_dump $DATABASE_URL > backup.sql

# Restore to staging
psql $STAGING_DATABASE_URL < backup.sql
```

## Security Considerations

1. **Credentials:** Never commit `.env` or `.dev.vars` to version control
2. **Secrets Rotation:** Regenerate `JWT_SECRET` and `COOKIE_SECRET` for production
3. **CORS:** Ensure `STORE_CORS` and `ADMIN_CORS` only allow trusted domains
4. **Database Access:** Use internal URLs in production for better security and performance

## Troubleshooting

### Common Issues

**"Cannot connect to database"**
- Verify you're using **external URLs** for local development
- Check Railway service status in dashboard

**"Migrations fail on deploy"**
- Check Railway logs: `railway logs`
- Ensure `DATABASE_URL` is correctly set
- Verify database is accessible

**"Backend won't start"**
- Check Dockerfile build logs in Railway dashboard
- Verify all environment variables are set
- Check healthcheck endpoint is responding

---

**Last Updated:** 2025-11-25  
**Maintained By:** Development Team  
**Railway Project:** gracestowel
