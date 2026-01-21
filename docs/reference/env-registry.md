# Environment Variable Registry

This document tracks all environment variables across deployment environments.
**Update this document whenever you add, modify, or remove environment variables.**

## Quick Reference

| Service | Local Dev | CI/Test | Staging | Production |
|---------|-----------|---------|---------|------------|
| Backend | `.env` | docker-compose.test.yml | Railway (staging) | Railway (prod) |
| Storefront | `.env` | docker-compose.test.yml | Cloudflare Pages (preview) | Cloudflare Pages (prod) |

---

## Backend (apps/backend)

| Variable | Required | Description | Local Dev | CI/Test | Staging | Production |
|----------|----------|-------------|-----------|---------|---------|------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | Railway dev DB | `postgresql://medusa_test:medusa_test@postgres:5432/medusa_test` | Railway staging | Railway prod |
| `REDIS_URL` | Yes | Redis connection string | Railway dev Redis | `redis://redis:6379` | Railway staging | Railway prod |
| `JWT_SECRET` | Yes | JWT signing secret | `dev-secret` | `test-secret` | Secure random | Secure random |
| `COOKIE_SECRET` | Yes | Cookie signing secret | `dev-secret` | `test-secret` | Secure random | Secure random |
| `NODE_ENV` | Yes | Runtime environment | `development` | `production` | `production` | `production` |
| `STORE_CORS` | Yes | Allowed storefront origins | `http://localhost:5173` | `http://localhost:5174,https://localhost:5174` | Staging URLs | Production URLs |
| `ADMIN_CORS` | Yes | Allowed admin origins | `http://localhost:7001` | `http://localhost:7002` | Staging admin URL | Production admin URL |
| `AUTH_CORS` | Yes | Allowed auth origins | `http://localhost:5173` | `http://localhost:5174,https://localhost:5174` | Staging URLs | Production URLs |
| `STRIPE_API_KEY` | Yes | Stripe secret key | Test key (`sk_test_...`) | Mock/skip | Test key | Live key (`sk_live_...`) |
| `POSTHOG_EVENTS_API_KEY` | No | PostHog events API key (Medusa Analytics) | Dev project | Skip | Staging project | Prod project |
| `POSTHOG_HOST` | No | PostHog host | `https://app.posthog.com` | Skip | `https://app.posthog.com` | `https://app.posthog.com` |
| `RESEND_API_KEY` | No | Resend email API key | Test key | `re_test_ci_placeholder_key` | Test key | Live key |
| `DATABASE_SSL` | No | Enable SSL for DB | `false` | `false` | `true` | `true` |
| `DISABLE_MEDUSA_ADMIN` | No | Disable admin UI | `false` | `true` | `false` | `false` |

---

## Storefront (apps/storefront)

| Variable | Required | Description | Local Dev | CI/Test | Staging | Production |
|----------|----------|-------------|-----------|---------|---------|------------|
| `MEDUSA_BACKEND_URL` | Yes | Backend API URL | `http://localhost:9000` | `http://backend:9000` | Staging backend URL | Production backend URL |
| `MEDUSA_PUBLISHABLE_KEY` | Yes | Medusa publishable API key | Dev key | `pk_4cc1cc37285c660264befb5cec0f50cdfded4a4371158da578d17cd24eeb8377` | Staging key | Production key |
| `NODE_ENV` | Yes | Runtime environment | `development` | `development` | `production` | `production` |
| `VITE_POSTHOG_API_KEY` | No | PostHog client key | Dev project | Skip | Staging project | Prod project |
| `VITE_POSTHOG_HOST` | No | PostHog host | `https://us.i.posthog.com` | Skip | `https://us.i.posthog.com` | `https://us.i.posthog.com` |

---

## Cloudflare Secrets (via `wrangler secret put`)

These are stored in Cloudflare and not in any file:

| Secret | Description | Staging | Production |
|--------|-------------|---------|------------|
| `MEDUSA_BACKEND_URL` | Backend API URL | Staging backend | Production backend |

---

## Deployment Checklist

### When pushing to Staging:
- [ ] All variables in Railway staging environment match registry
- [ ] Cloudflare Pages preview environment has correct secrets
- [ ] Test keys used for Stripe, Resend, etc.

### When pushing to Production:
- [ ] **CRITICAL**: Switch Stripe from test (`sk_test_`) to live (`sk_live_`) key
- [ ] **CRITICAL**: Verify CORS URLs point to production domains
- [ ] **CRITICAL**: Generate new secure random secrets for JWT_SECRET and COOKIE_SECRET
- [ ] Verify PostHog points to production project
- [ ] Verify Resend uses production API key
- [ ] Cloudflare production secrets are set via `wrangler secret put`

---

## Adding New Environment Variables

1. Add to this registry with all environment values
2. Add to `.env.example` files (no real values!)
3. Add to `docker-compose.test.yml` if needed for E2E tests
4. Add to Railway/Cloudflare dashboards
5. Update any deployment documentation

---

## Secret Rotation

When rotating secrets:
1. Generate new secret
2. Update in Railway/Cloudflare dashboard
3. Redeploy affected services
4. Verify functionality
5. Document rotation date (optional: keep rotation log below)

### Rotation Log
| Secret | Service | Rotated On | Reason |
|--------|---------|------------|--------|
| | | | |
