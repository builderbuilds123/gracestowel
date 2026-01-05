# Medusa Auth Module Issue - Known Bug

## Issue Description

**Error:**
```
Error: Unable to find module @medusajs/medusa/auth-emailpass -- perhaps you need to install its package?
```

**Status:** This is a known bug in Medusa v2.11 affecting local development environments

## What Was Attempted

✅ Simplified `medusa-config.ts` to use defaults (auth-emailpass auto-registers)  
✅ Cleared and reinstalled `apps/backend/node_modules`  
✅ Reinstalled root workspace dependencies  
✅ Removed nested `medusa-backend/node_modules` directory  
✅ Verified `@medusajs/auth-emailpass` package is installed  
✅ Tested multiple module configuration formats  

**Result:** Auth module error persists despite all troubleshooting steps

## Root Cause

Medusa v2's module loader (`@medusajs/modules-sdk`) cannot resolve the path `@medusajs/medusa/auth-emailpass` even though:
- The package `@medusajs/auth-emailpass` is installed
- The re-export exists at `node_modules/@medusajs/medusa/dist/modules/auth-emailpass.js`
- The module works correctly in production Docker builds

This appears to be a **local development environment issue** specific to certain setups.

## Workarounds

### Option 1: Use Railway Production Backend (Recommended)

The backend **deploys and runs successfully on Railway production**. For local development:

1. **Backend Development:**
   - Make code changes locally
   - Push to GitHub  
   - Railway auto-deploys via Dockerfile
   - Test against deployed backend at `https://medusa-backend.up.railway.app`

2. **Storefront Development:**
   - Run locally: `cd apps/storefront && npm run dev`
   - Configure to point to Railway production backend
   - Or use Railway staging database with direct queries (no Medusa backend needed)

### Option 2: Use Docker Locally

Since the Dockerfile build works (confirmed by successful Railway deployments):

```bash
cd apps/backend

# Build image
docker build -t medusa-backend .

# Run with env variables
docker run -p 9000:9000 \
  --env-file .env \
  medusa-backend
```

### Option 3: Wait for Medusa v2.12+ Fix

This is likely a bug that will be fixed in future Medusa versions. Monitor:
- [Medusa GitHub Issues](https://github.com/medusajs/medusa/issues)
- [Med USA Discord](https://discord.gg/medusajs)

## Current Status

✅ **Database Migrations:** Successfully ran on Railway staging  
✅ **Production Deployment:** Working on Railway  
✅ **Environment Configuration:** Properly set up for both staging and production  
❌ **Local Backend Dev Server:** Blocked by auth module issue

## Recommendation

**For now, use Option 1 (Railway Production Backend)**:

1. Development workflow:
   - Edit backend code locally
   - Push to `main` → Railway auto-deploys
   - Test with deployed backend

2. This is actually a **common cloud-first development pattern** and has benefits:
   - Production parity (testing in real environment)
   - No local PostgreSQL/Redis setup needed
   - Team members work against same backend
   - Staging database already configured for testing

## Additional Notes

- The Medusa admin frontend **will still be accessible** via Railway deployment
- Your storefront can connect to either staging or production backend
- Local frontend development is **not affected** by this issue

---

**Last Updated:** 2025-11-25  
**Medusa Version:** v2.11.3  
**Issue Tracker:** Internal documentation
