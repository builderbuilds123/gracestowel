# Environment Setup Guide

## Overview
This document describes the required environment variables for both **development** (Railway Development project) and **production** (Railway Production project). It also explains how to obtain the credentials from Railway and how Cloudflare Workers will inject production values.

## 1. Railway Development Project

### 1.1 Create the Project
1. Log in to the Railway dashboard.
2. Click **"New Project"** → name it `gracestowel-dev`.
3. Add **PostgreSQL** and **Redis** services.
4. In each service, go to **"Connect" → "Public Networking"** and copy the **External URL** (proxy URL).
   - PostgreSQL example: `postgresql://postgres:<password>@shuttle.proxy.rlwy.net:XXXXX/railway`
   - Redis example: `redis://default:<password>@shortline.proxy.rlwy.net:XXXXX`

### 1.2 Environment Variables
Create a `.env` file in `apps/backend/` (already generated) with the following placeholders replaced by the URLs you copied:
```
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
STORE_CORS="http://localhost:5173"
ADMIN_CORS="http://localhost:7001"
AUTH_CORS="http://localhost:5173"
JWT_SECRET="dev-secret"
COOKIE_SECRET="dev-secret"
```

Create a `.dev.vars` file in `apps/storefront/` with:
```
DATABASE_URL="postgresql://..."
```
Both files are ignored by Git (see `.gitignore`).

## 2. Railway Production Project
The production project already exists (your current setup). Railway will automatically inject the **internal** URLs as environment variables when the Medusa service is deployed. You do **not** need to store them locally.

### Production Variables (automatically set by Railway)
- `DATABASE_URL` – e.g. `postgresql://postgres:<password>@postgres.railway.internal:5432/railway`
- `REDIS_URL` – e.g. `redis://default:<password>@shortline.proxy.rlwy.net:34142`
- CORS values should point to your live domain.

## 3. Cloudflare Workers (Remix Frontend)
- In production, Cloudflare will receive the same `DATABASE_URL` and `REDIS_URL` from Railway via the Worker environment.
- No `.dev.vars` is used in production; the values are injected automatically.

## 4. Common Gotchas
- **Use external proxy URLs** for local development. The internal `*.railway.internal` URLs only work inside Railway's network.
- Keep `.dev.vars` and `.env` out of version control – they contain secrets.
- When you change the Railway dev URLs, update both backend `.env` and frontend `.dev.vars`.
- If you ever add Cloudflare Hyperdrive, you will only need to add the binding in `wrangler.toml`; the `db.server.ts` utility will automatically prefer `env.HYPERDRIVE.connectionString`.

---

*Happy coding!*
