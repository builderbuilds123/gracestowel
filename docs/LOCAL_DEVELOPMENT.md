# Local Development Setup Guide (No Docker)

This guide walks you through setting up the Grace Stowel e-commerce platform locally without Docker.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         LOCAL SETUP                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐         ┌──────────────────┐                 │
│   │  PostgreSQL  │◄───────►│  Medusa Backend  │                 │
│   │  localhost   │         │  localhost:9000  │                 │
│   │     :5432    │         │                  │                 │
│   └──────────────┘         └────────▲─────────┘                 │
│                                     │                            │
│   ┌──────────────┐                  │ REST API                  │
│   │    Redis     │◄─────────────────┤                           │
│   │  localhost   │   Event Bus      │                           │
│   │     :6379    │   Sessions       │                           │
│   └──────────────┘   Job Queue      │                           │
│                                     │                            │
│                            ┌────────▼─────────┐                 │
│   PostgreSQL ◄─────────────│    Storefront    │                 │
│   (Hyperdrive read)        │ localhost:5173   │                 │
│                            └──────────────────┘                 │
│                                                                  │
│   ┌──────────────┐                                              │
│   │  Stripe CLI  │ ─────► Webhook forwarding to backend         │
│   └──────────────┘                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Software

| Software | Version | Installation |
|----------|---------|--------------|
| Node.js | 22+ (24 recommended) | `brew install node@24` |
| pnpm | 9.15.2+ | `npm install -g pnpm@9.15.2` |
| PostgreSQL | 16+ | `brew install postgresql@16` |
| Redis | 7+ | `brew install redis` |
| Stripe CLI | Latest | `brew install stripe/stripe-cli/stripe` |

### Install All Prerequisites (macOS)

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/master/install.sh)"

# Install all required software
brew install postgresql@16 redis node@24 stripe/stripe-cli/stripe
npm install -g pnpm@9.15.2
```

### Add to PATH (if needed)

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
# Homebrew
eval "$(/opt/homebrew/bin/brew shellenv)"

# PostgreSQL
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# Node (if using brew's node)
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

Then reload: `source ~/.zshrc`

---

## Step 1: Start Database Services

```bash
# Start PostgreSQL
brew services start postgresql@16

# Start Redis
brew services start redis

# Verify services are running
brew services list
# Should show postgresql@16 and redis as "started"
```

### Verify Connections

```bash
# Test PostgreSQL
psql -l

# Test Redis
redis-cli ping
# Should return: PONG
```

---

## Step 2: Create Database

```bash
# Create the medusa database
createdb medusa

# Verify it was created
psql -l | grep medusa
```

---

## Step 3: Configure Backend

### Create `.env` file

```bash
cd apps/backend
cp .env.example .env
```

### Edit `.env` with local settings:

```env
# =============================================================================
# Database & Cache (Local)
# =============================================================================
DATABASE_URL="postgresql://YOUR_USERNAME@localhost:5432/medusa"
DATABASE_SSL=false
REDIS_URL="redis://localhost:6379"

# =============================================================================
# CORS Configuration
# =============================================================================
STORE_CORS="http://localhost:5173,https://localhost:5173,http://localhost:5174,https://localhost:5174"
ADMIN_CORS="http://localhost:7001,http://localhost:9000"
AUTH_CORS="http://localhost:5173,https://localhost:5173,http://localhost:5174,https://localhost:5174"

# =============================================================================
# Security
# =============================================================================
JWT_SECRET="dev-secret-change-in-production"
COOKIE_SECRET="dev-secret-change-in-production"

# =============================================================================
# Stripe Configuration
# Get keys from: https://dashboard.stripe.com/test/apikeys
# =============================================================================
STRIPE_SECRET_KEY="sk_test_YOUR_KEY"
STRIPE_PUBLISHABLE_KEY="pk_test_YOUR_KEY"
STRIPE_WEBHOOK_SECRET="whsec_YOUR_SECRET"  # From `stripe listen` output

# =============================================================================
# Optional: File Storage (Cloudflare R2/S3)
# Leave commented for local file storage
# =============================================================================
# S3_ENDPOINT=https://YOUR_ACCOUNT.r2.cloudflarestorage.com
# S3_PUBLIC_URL=https://your-cdn.com
# S3_BUCKET=your-bucket
# S3_REGION=auto
# S3_ACCESS_KEY_ID=your-key
# S3_SECRET_ACCESS_KEY=your-secret

# =============================================================================
# Optional: Email (Resend)
# =============================================================================
# RESEND_API_KEY=re_YOUR_KEY
# RESEND_FROM_EMAIL=onboarding@resend.dev

# =============================================================================
# Optional: Analytics (PostHog)
# =============================================================================
# POSTHOG_API_KEY=phc_YOUR_KEY
# POSTHOG_HOST=https://app.posthog.com
```

> **Note:** Replace `YOUR_USERNAME` with your macOS username (run `whoami` to check).

---

## Step 4: Configure Storefront

### Create `.dev.vars` file

```bash
cd apps/storefront
cp .dev.vars.example .dev.vars
```

### Edit `.dev.vars`:

```env
# Database (for Hyperdrive local simulation)
DATABASE_URL=postgresql://YOUR_USERNAME@localhost:5432/medusa

# Medusa Backend
MEDUSA_BACKEND_URL=http://localhost:9000
MEDUSA_PUBLISHABLE_KEY=pk_YOUR_MEDUSA_PUBLISHABLE_KEY

# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY
STRIPE_SECRET_KEY=sk_test_YOUR_KEY

# Optional: Analytics
# VITE_POSTHOG_API_KEY=phc_YOUR_KEY
# VITE_POSTHOG_HOST=https://app.posthog.com
```

> **Note:** You'll get `MEDUSA_PUBLISHABLE_KEY` from the Medusa Admin after starting the backend.

---

## Step 5: Install Dependencies & Run Migrations

```bash
# From the repo root
cd /path/to/gracestowel

# Install all dependencies
pnpm install --ignore-scripts

# Build the backend
cd apps/backend
pnpm run build

# Run database migrations
npx medusa db:migrate

# Seed the database (optional, for sample data)
pnpm run seed

# Create an admin user
npx medusa user -e admin@example.com -p admin123
```

---

## Step 6: Start All Services

You'll need **4 terminal windows/tabs**:

### Terminal 1: Backend

```bash
cd apps/backend
pnpm run dev
```

Expected output:
```
✔ Server is ready on port: 9000
info:    Admin URL → http://localhost:9000/app
```

### Terminal 2: Storefront

```bash
cd apps/storefront
pnpm run dev
```

Expected output:
```
➜  Local:   https://localhost:5173/
```

### Terminal 3: Stripe Webhook Forwarding

```bash
# Login (first time only)
stripe login

# Forward webhooks to local backend
stripe listen --forward-to http://localhost:9000/webhooks/stripe
```

Expected output:
```
Ready! Your webhook signing secret is whsec_xxxxx
```

> **Important:** Copy the `whsec_xxxxx` secret and add it to your backend `.env` as `STRIPE_WEBHOOK_SECRET`, then restart the backend.

### Terminal 4: (Optional) Watch Logs

```bash
# Watch backend logs
tail -f apps/backend/logs/*.log

# Or watch Redis
redis-cli monitor
```

---

## Step 7: Get Medusa Publishable Key

1. Open http://localhost:9000/app
2. Login with your admin credentials (e.g., `admin@example.com` / `admin123`)
3. Go to **Settings** → **API Keys** → **Publishable API Keys**
4. Click **Create API Key**
5. Name it "Local Development"
6. Copy the key (starts with `pk_`)
7. Add it to `apps/storefront/.dev.vars` as `MEDUSA_PUBLISHABLE_KEY`
8. Restart the storefront

---

## Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Storefront | https://localhost:5173 | Customer-facing store |
| Backend API | http://localhost:9000 | REST API |
| Admin Dashboard | http://localhost:9000/app | Medusa Admin UI |
| Health Check | http://localhost:9000/health | Backend health status |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache/Queue |

---

## Testing Payments

### Test Card Numbers

| Card Number | Result |
|-------------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Declined |
| `4000 0025 0000 3155` | Requires 3D Secure |

- **Expiry:** Any future date (e.g., `12/34`)
- **CVC:** Any 3 digits (e.g., `123`)
- **ZIP:** Any 5 digits (e.g., `12345`)

### Verify Webhook Processing

When you complete a test payment, you should see in Terminal 3 (Stripe CLI):

```
2024-xx-xx --> payment_intent.succeeded [evt_xxx]
2024-xx-xx <-- [200] POST http://localhost:9000/webhooks/stripe
```

---

## Quick Start Script

Create `start-local.sh` at the repo root:

```bash
#!/bin/bash
set -e

echo "🚀 Starting Grace Stowel Local Development"
echo ""

# Check if services are running
if ! brew services list | grep -q "postgresql.*started"; then
    echo "Starting PostgreSQL..."
    brew services start postgresql@16
fi

if ! brew services list | grep -q "redis.*started"; then
    echo "Starting Redis..."
    brew services start redis
fi

# Check database exists
if ! psql -lqt | cut -d \| -f 1 | grep -qw medusa; then
    echo "Creating medusa database..."
    createdb medusa
fi

echo ""
echo "✅ Infrastructure ready!"
echo ""
echo "Run these commands in separate terminals:"
echo ""
echo "  Terminal 1 (Backend):"
echo "    cd apps/backend && pnpm run dev"
echo ""
echo "  Terminal 2 (Storefront):"
echo "    cd apps/storefront && pnpm run dev"
echo ""
echo "  Terminal 3 (Stripe Webhooks):"
echo "    stripe listen --forward-to http://localhost:9000/webhooks/stripe"
echo ""
echo "Access:"
echo "  • Storefront:  https://localhost:5173"
echo "  • Admin:       http://localhost:9000/app"
echo ""
```

Make it executable: `chmod +x start-local.sh`

---

## Stopping Services

```bash
# Stop database services
brew services stop postgresql@16
brew services stop redis

# Stop backend/storefront: Ctrl+C in their terminals
# Stop Stripe CLI: Ctrl+C
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` to PostgreSQL | `brew services restart postgresql@16` |
| `ECONNREFUSED` to Redis | `brew services restart redis` |
| Migrations fail with SSL error | Ensure `DATABASE_SSL=false` in `.env` |
| Admin login fails | Re-run `npx medusa user -e admin@example.com -p admin123` |
| Storefront blank page | Check browser console; verify `MEDUSA_PUBLISHABLE_KEY` |
| Webhooks not received | Verify `STRIPE_WEBHOOK_SECRET` matches CLI output |
| Payment Element not loading | Check `STRIPE_PUBLISHABLE_KEY` in `.dev.vars` |
| Self-signed cert warning | Click "Advanced" → "Proceed to localhost" |
| Port already in use | Kill orphaned process: `lsof -ti:PORT | xargs kill -9` |

### Check Service Status

```bash
# PostgreSQL
brew services info postgresql@16

# Redis
redis-cli ping

# Backend health
curl http://localhost:9000/health

# Stripe CLI status
stripe status
```

### View Logs

```bash
# Backend logs (if configured)
tail -f apps/backend/logs/*.log

# PostgreSQL logs
tail -f /opt/homebrew/var/log/postgresql@16.log

# Redis logs
tail -f /opt/homebrew/var/log/redis.log
```

---

## Switching Between Local and Railway

To switch back to Railway (remote) development:

### Backend `.env`

```env
# Comment out local URLs
# DATABASE_URL="postgresql://username@localhost:5432/medusa"
# DATABASE_SSL=false
# REDIS_URL="redis://localhost:6379"

# Uncomment Railway URLs
DATABASE_URL="postgresql://postgres:xxx@ballast.proxy.rlwy.net:59508/railway"
REDIS_URL="redis://default:xxx@switchyard.proxy.rlwy.net:24084"
```

### Storefront `.dev.vars`

```env
# Update DATABASE_URL to Railway's external URL
DATABASE_URL=postgresql://postgres:xxx@ballast.proxy.rlwy.net:59508/railway
```

---

## Stripe Integration Notes

### How Payments Work Locally

1. **Payment UI** - Loads from Stripe's CDN (no tunnel needed)
2. **Payment Intent Creation** - Your server → Stripe API (outbound, works locally)
3. **Card Tokenization** - Browser → Stripe API (direct, works locally)
4. **Webhooks** - Stripe servers → Your localhost (requires `stripe listen`)

### What Requires `stripe listen`

Without the Stripe CLI forwarding webhooks:
- ❌ Orders won't be created in your database
- ❌ Inventory won't be decremented
- ❌ Confirmation emails won't be sent
- ❌ Payment capture won't be scheduled

The payment will succeed on Stripe's side, but your backend won't know about it.

---

## Environment Variable Reference

### Backend (`apps/backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DATABASE_SSL` | No | Set to `false` for local dev |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | JWT signing secret |
| `COOKIE_SECRET` | Yes | Cookie encryption secret |
| `STORE_CORS` | Yes | Allowed storefront origins |
| `ADMIN_CORS` | Yes | Allowed admin origins |
| `AUTH_CORS` | Yes | Allowed auth origins |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `RESEND_API_KEY` | No | Email service API key |
| `S3_*` | No | File storage configuration |

### Storefront (`apps/storefront/.dev.vars`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection (for Hyperdrive) |
| `MEDUSA_BACKEND_URL` | Yes | Backend API URL |
| `MEDUSA_PUBLISHABLE_KEY` | Yes | Medusa store API key |
| `STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `VITE_POSTHOG_*` | No | Analytics configuration |
