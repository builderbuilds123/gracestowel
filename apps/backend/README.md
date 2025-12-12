---
title: Medusa Backend Configuration
description: Configuration guide for Medusa V2 backend on Railway.
last-updated: 2025-12-02
---

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
   pnpm install
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
   pnpm run dev
   ```

   The backend will be available at:
   - **API:** http://localhost:8080
   - **Admin Dashboard:** http://localhost:8080/app

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

## Admin Dashboard

The Medusa Admin Dashboard is enabled and accessible at `/app` when the backend is running.

### Accessing the Admin Dashboard

- **Local Development:** http://localhost:8080/app
- **Production:** https://your-backend-url.railway.app/app

### Admin Features

- **Products:** Create, edit, and manage products and variants
- **Orders:** View and manage customer orders
- **Customers:** View customer accounts and order history
- **Inventory:** Track stock levels across locations
- **Settings:** Configure regions, currencies, and shipping options

### Creating an Admin User

```bash
# Local development
npx medusa user create

# Railway production
railway run npx medusa user create
```

## Email Notifications (Resend)

Order confirmation emails are sent automatically when orders are placed.

### Configuration

Add these environment variables:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxx  # Your Resend API key
RESEND_FROM_EMAIL=orders@yourdomain.com  # Sender email address
```

### Getting a Resend API Key

1. Create an account at [resend.com](https://resend.com)
2. Go to **API Keys** in the sidebar
3. Click **Create API Key**
4. Copy the key and add it to your environment variables

### Email Templates

Email templates are located in `src/modules/resend/emails/`:
- `order-placed.tsx` - Order confirmation email

### Testing Emails

For development, you can use Resend's test mode:
- Use `onboarding@resend.dev` as the sender
- Emails will only be sent to your Resend account email

## Stripe Webhooks

Stripe webhooks are used to create orders when payments succeed.

### Configuration

```bash
STRIPE_SECRET_KEY=sk_xxxx  # Your Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_xxxx  # Webhook signing secret
```

### Setting Up Webhooks in Stripe Dashboard

1. Go to **Developers → Webhooks** in Stripe Dashboard
2. Click **Add endpoint**
3. Enter your webhook URL: `https://your-backend-url/webhooks/stripe`
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Copy the signing secret and add it to `STRIPE_WEBHOOK_SECRET`
