# Railway Infrastructure Documentation

## Overview

This document serves as the source of truth for the Grace's Towel Railway infrastructure. Railway provides managed PostgreSQL and Redis instances, with the Medusa backend deployed as a containerized service.

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

### Production Environment

**Purpose:** Live customer-facing services

| Service | Type | Internal URL | External URL |
|---------|------|--------------|--------------|
| PostgreSQL | Managed Database | `postgres.railway.internal:5432` | `shuttle.proxy.rlwy.net:48905` |
| Redis | Managed Cache | (internal) | `shortline.proxy.rlwy.net:34142` |
| Medusa Backend | Container | (auto-assigned) | `medusa-backend.up.railway.app` |

**Environment Variables (set in Railway dashboard):**
```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
STORE_CORS=https://gracestowel.com
ADMIN_CORS=https://admin.gracestowel.com
JWT_SECRET=<production-secret>
COOKIE_SECRET=<production-secret>
NODE_ENV=production
```

### Staging Environment

**Purpose:** Shared development environment for team collaboration

| Service | Type | External URL |
|---------|------|--------------|
| PostgreSQL | Managed Database | `ballast.proxy.rlwy.net:59508` |
| Redis | Managed Cache | `switchyard.proxy.rlwy.net:24084` |

## Deployment Configuration

### Backend Service (Production)

Defined in `railway.toml`:

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

### Storefront (Cloudflare Workers)

Not deployed on Railway. Deployed to Cloudflare Workers via:
```bash
cd apps/storefront
pnpm run deploy
```

## Database Schema Management

### Migrations

**Running Migrations:**

**Production:**
```bash
# Auto-runs on deployment (see Dockerfile CMD)
npx medusa db:migrate && npm run start
```

**Staging:**
```bash
cd apps/backend
pnpm run dev  # Auto-runs migrations on start
```

## Connection Details

### Internal URLs (Railway Private Network)

Used **only within Railway** (e.g., Medusa backend container → PostgreSQL):
- PostgreSQL: `postgres.railway.internal:5432`

### External URLs (TCP Proxy)

Used for **local development** and **external connections**:
- Production PostgreSQL: `shuttle.proxy.rlwy.net:48905`
- Production Redis: `shortline.proxy.rlwy.net:34142`
- Staging PostgreSQL: `ballast.proxy.rlwy.net:59508`
- Staging Redis: `switchyard.proxy.rlwy.net:24084`

## Monitoring & Logs

**Access Logs:**
```bash
railway logs --service medusa-backend
```

**Dashboard:** [Railway Dashboard](https://railway.app/dashboard)

## Backup & Recovery

**Automatic Backups:**
- Railway automatically backs up PostgreSQL databases
- Retention: 7 days (Hobby plan)

**Manual Backup:**
```bash
railway run pg_dump $DATABASE_URL > backup.sql
psql $STAGING_DATABASE_URL < backup.sql
```

## Security Considerations

1. **Credentials:** Never commit `.env` or `.dev.vars` to version control
2. **Secrets Rotation:** Regenerate `JWT_SECRET` and `COOKIE_SECRET` for production
3. **CORS:** Ensure `STORE_CORS` and `ADMIN_CORS` only allow trusted domains
4. **Database Access:** Use internal URLs in production for better security

## Troubleshooting

### Common Issues

**"Cannot connect to database"**
- Verify you're using **external URLs** for local development
- Check Railway service status in dashboard

**"Migrations fail on deploy"**
- Check Railway logs: `railway logs`
- Ensure `DATABASE_URL` is correctly set

**"Backend won't start"**
- Check Dockerfile build logs in Railway dashboard
- Verify all environment variables are set

---

**Last Updated:** 2025-11-25
