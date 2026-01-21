# Security Best Practices - Storefront

## Environment Variables & Secrets

### Local Development

**✅ Secure Configuration (`.dev.vars`)**
- ✅ `.dev.vars` is in `.gitignore` - NEVER commit this file
- ✅ Contains sensitive credentials (e.g., MEDUSA_BACKEND_URL, publishable keys)
- ✅ Template provided in `.dev.vars.example`
- ✅ Each developer maintains their own `.dev.vars` locally

**Setup Instructions:**
```bash
# 1. Copy the example file
cp .dev.vars.example .dev.vars

# 2. Fill in your actual credentials
# Edit .dev.vars with your Medusa backend URL and publishable keys

# 3. Verify it's not tracked by git
git status .dev.vars  # Should show nothing
```

### Production Secrets

**Cloudflare Workers Secrets:**
```bash
# Set production secrets using Wrangler CLI
wrangler secret put MEDUSA_BACKEND_URL
# Enter: https://your-backend.railway.app

```

## What NOT to Commit

❌ **NEVER commit these files:**
- `.dev.vars` - Contains database credentials
- `.env` - Contains any secrets
- `wrangler.toml` with hardcoded secrets
- Any file with passwords, API keys, or tokens

✅ **SAFE to commit:**
- `.dev.vars.example` - Template without actual values
- `wrangler.jsonc` - Configuration without secrets (after our fix)
- `.gitignore` - Ensures secrets are excluded

## Security Checklist

Before committing code:

- [ ] No hardcoded passwords or API keys
- [ ] No database connection strings in committed files
- [ ] `.dev.vars` is in `.gitignore` and not staged
- [ ] Only example/template files are committed
- [ ] Secrets are set via Wrangler CLI or Cloudflare Dashboard

## Credential Rotation

If credentials were exposed:

1. **Immediately rotate** the database password in Railway
2. Update `.dev.vars` locally with new credentials
3. Notify team members to update their local `.dev.vars`

## Questions?

- **Q: Where do I set my local database URL?**
  - A: In `.dev.vars` (copy from `.dev.vars.example`)

- **Q: How do I set production secrets?**
  - A: Use `wrangler secret put SECRET_NAME` or Cloudflare Dashboard

- **Q: What if I accidentally committed a secret?**
  - A: 1) Rotate the credential immediately, 2) Remove from git history, 3) Update all environments

---

**Last Updated:** 2025-11-27
**Maintained By:** Development Team
