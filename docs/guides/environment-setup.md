---
title: Environment Setup Guide
description: Configuration guide for Staging and Production environments.
last-updated: 2025-12-02
---

# Environment Setup Guide: Staging & Production

This guide details how to configure strict separation between Staging and Production environments for Grace Stowel, covering Cloudflare Workers (Storefront) and GitHub Actions.

## 1. Cloudflare Workers (Storefront)

**Best Practice**: Do **NOT** create separate worker projects manually. Use **Cloudflare Environments** within the same project. This allows you to manage everything from a single `wrangler.jsonc` while keeping deployments isolated.

### Step 1: Update `apps/storefront/wrangler.jsonc`

Modify your configuration to define `staging` and `production` environments. This allows you to deploy to specific targets using `wrangler deploy --env staging`.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "gracestowelstorefront",
  "compatibility_date": "2025-04-04",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./workers/app.ts",
  
  // SHARED VARIABLES (Applies to all environments unless overridden)
  "vars": {
    "APP_ENV": "development"
  },

  // ==========================================
  // STAGING ENVIRONMENT
  // Deploy command: npx wrangler deploy --env staging
  // URL: https://staging.gracestowelstorefront.pages.dev (or custom domain)
  // ==========================================
  "env": {
    "staging": {
      "name": "gracestowelstorefront-staging", // Creates a separate worker script
      "vars": {
        "APP_ENV": "staging",
        "MEDUSA_BACKEND_URL": "https://gracestowel-backend-staging.up.railway.app"
      },
      // Staging-specific Hyperdrive (if needed)
      "hyperdrive": [
        {
          "binding": "HYPERDRIVE",
          "id": "<STAGING_HYPERDRIVE_ID>"
        }
      ]
    },

    // ==========================================
    // PRODUCTION ENVIRONMENT
    // Deploy command: npx wrangler deploy --env production
    // URL: https://gracestowel.com
    // ==========================================
    "production": {
      "name": "gracestowelstorefront-production",
      "routes": [
        { "pattern": "gracestowel.com", "custom_domain": true },
        { "pattern": "www.gracestowel.com", "custom_domain": true }
      ],
      "vars": {
        "APP_ENV": "production",
        "MEDUSA_BACKEND_URL": "https://gracestowel-backend.up.railway.app"
      },
      // Production Hyperdrive
      "hyperdrive": [
        {
          "binding": "HYPERDRIVE",
          "id": "1dffb86ef8b64f5197bd875b8e1cc026"
        }
      ]
    }
  }
}
```

### Step 2: Set Secrets for Each Environment

Secrets (like API keys) are not stored in `wrangler.jsonc`. You must set them for each environment explicitly via CLI:

**For Staging:**
```bash
npx wrangler secret put STRIPE_PUBLIC_KEY --env staging
# Paste staging key when prompted
```

**For Production:**
```bash
npx wrangler secret put STRIPE_PUBLIC_KEY --env production
# Paste live key when prompted
```

---

## 2. GitHub Actions Environments

GitHub Environments allow you to protect branches and manage secrets (like `RAILWAY_TOKEN` or `CLOUDFLARE_API_TOKEN`) separately for Staging and Production.

### Step 1: Create Environments in GitHub

1.  Go to your GitHub Repository.
2.  Click **Settings** > **Environments**.
3.  Click **New environment**.
4.  Name it `staging`.
5.  Repeat to create `production`.

### Step 2: Configure Environment Secrets

For each environment (`staging` and `production`), add the necessary secrets:

*   **`RAILWAY_TOKEN`**: The deployment token for the specific Railway environment (Staging vs Prod).
*   **`CLOUDFLARE_API_TOKEN`**: Your Cloudflare API token (can be the same if it has access to both).
*   **`CLOUDFLARE_ACCOUNT_ID`**: Your Cloudflare Account ID.

### Step 3: Update CI/CD Workflow (`.github/workflows/ci.yml`)

Update your deployment jobs to reference these environments. This tells GitHub to load the specific secrets for that environment.

```yaml
jobs:
  # ... build/test jobs ...

  deploy-staging:
    name: Deploy Staging
    runs-on: ubuntu-latest
    needs: [validate, test-backend, test-storefront]
    environment: staging  # <--- LOADS STAGING SECRETS
    if: github.ref == 'refs/heads/staging'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy Storefront
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/storefront
          command: deploy --env staging

  deploy-production:
    name: Deploy Production
    runs-on: ubuntu-latest
    needs: [validate, test-backend, test-storefront]
    environment: production # <--- LOADS PRODUCTION SECRETS
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy Storefront
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/storefront
          command: deploy --env production
```

## Summary of Workflow

1.  **Code Push**:
    *   Push to `staging` branch -> Triggers `deploy-staging` job -> Uses `staging` GitHub Environment -> Deploys to `[env.staging]` in Cloudflare.
    *   Push to `main` branch -> Triggers `deploy-production` job -> Uses `production` GitHub Environment -> Deploys to `[env.production]` in Cloudflare.

2.  **Safety**:
    *   Secrets are isolated. Staging cannot access Production keys.
    *   `wrangler.jsonc` configuration ensures the Storefront connects to the correct Backend URL for that environment.
