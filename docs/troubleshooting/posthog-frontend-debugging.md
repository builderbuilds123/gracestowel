# PostHog Frontend Debugging Guide

## Problem: No Frontend Events in PostHog

If you're not seeing frontend events in PostHog, follow these steps:

## Step 1: Verify GitHub Actions Secret

The `VITE_POSTHOG_API_KEY` secret must be set in GitHub Actions for the build to work.

### Check if secret exists:
```bash
# This requires appropriate permissions
gh secret list | grep VITE_POSTHOG
```

### Add the secret if missing:
1. Go to: https://github.com/builderbuilds123/gracestowel/settings/secrets/actions
2. Click "New repository secret"
3. Name: `VITE_POSTHOG_API_KEY`
4. Value: Your PostHog project API key (starts with `phc_` or `ph_`)
5. Click "Add secret"

## Step 2: Verify Build is Using the Secret

Check the latest CI/CD build logs:
```bash
gh run list --limit 1
gh run view <run-id> --log | grep -i posthog
```

Look for:
- ✅ Environment variables being passed to build step
- ✅ No errors about missing API key
- ✅ Build completing successfully

## Step 3: Check Deployed Code

### Option A: Browser Console (Easiest)

1. Open your deployed storefront (staging or production)
2. Open browser DevTools (F12)
3. Go to Console tab
4. Look for PostHog initialization messages:
   - `[PostHog Init] API Key present: true/false`
   - `[PostHog Init] ✅ Successfully initialized` (success)
   - `[PostHog Init] ❌ PostHog NOT initialized` (failure)

### Option B: Check Network Tab

1. Open DevTools → Network tab
2. Filter by "posthog" or "us.i.posthog.com"
3. Look for requests to PostHog API
4. If no requests appear, PostHog is not initialized

### Option C: Check Built Code

The API key should be embedded in the built JavaScript. Check:
```bash
# After a build, check if API key is in the output
grep -r "phc_" apps/storefront/dist/ || echo "API key not found in build"
```

**Note:** The API key will be minified/obfuscated in production builds.

## Step 4: Common Issues

### Issue 1: Secret Not Set
**Symptom:** Console shows `[PostHog] API key not configured. Skipping initialization.`

**Fix:** Add `VITE_POSTHOG_API_KEY` secret to GitHub Actions (see Step 1)

### Issue 2: Wrong Secret Name
**Symptom:** Build succeeds but PostHog doesn't initialize

**Fix:** Ensure secret is named exactly `VITE_POSTHOG_API_KEY` (case-sensitive)

### Issue 3: Secret Set But Not Used
**Symptom:** Secret exists but build doesn't use it

**Fix:** 
1. Verify the secret is in the correct repository
2. Check that the workflow file uses `${{ secrets.VITE_POSTHOG_API_KEY }}`
3. Re-run the workflow after adding the secret

### Issue 4: Build Cache Issues
**Symptom:** Changes not reflected after adding secret

**Fix:** Clear build cache and rebuild:
```bash
# In CI/CD, the cache is keyed by commit SHA, so a new commit should work
# Or manually clear the cache in GitHub Actions settings
```

## Step 5: Manual Verification

To manually test if PostHog would work:

1. **Local Build Test:**
   ```bash
   cd apps/storefront
   VITE_POSTHOG_API_KEY=ph_test_key_here VITE_POSTHOG_HOST=https://us.i.posthog.com pnpm build
   ```

2. **Check Build Output:**
   ```bash
   # Search for PostHog initialization in built code
   grep -i "posthog" apps/storefront/dist/client/assets/*.js | head -5
   ```

3. **Local Dev Test:**
   ```bash
   # Create .env.local file
   echo "VITE_POSTHOG_API_KEY=ph_test_key_here" > apps/storefront/.env.local
   echo "VITE_POSTHOG_HOST=https://us.i.posthog.com" >> apps/storefront/.env.local
   
   # Run dev server
   pnpm dev
   
   # Check browser console for PostHog initialization
   ```

## Step 6: Verify PostHog Project Settings

1. Go to PostHog dashboard: https://us.i.posthog.com
2. Check project settings
3. Verify API key matches what you set in GitHub
4. Check if project is active and receiving events

## Quick Diagnostic Script

Run this in browser console on deployed site:

```javascript
// PostHog Diagnostic
console.group('PostHog Diagnostic');
console.log('API Key in env:', !!import.meta.env.VITE_POSTHOG_API_KEY);
console.log('Host:', import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com');
console.log('PostHog on window:', !!window.posthog);
if (window.posthog) {
  console.log('PostHog methods:', {
    capture: typeof window.posthog.capture,
    identify: typeof window.posthog.identify,
    distinctId: window.posthog.get_distinct_id?.() || 'unknown'
  });
} else {
  console.error('PostHog NOT initialized!');
}
console.groupEnd();
```

## Expected Behavior

After fixing the issue, you should see:

1. **Browser Console:**
   - `[PostHog Init] API Key present: true`
   - `[PostHog Init] ✅ Successfully initialized`
   - `[PostHog] Successfully initialized` (in dev mode)

2. **Network Tab:**
   - Requests to `https://us.i.posthog.com/batch/` or `/capture/`
   - Status 200 responses

3. **PostHog Dashboard:**
   - Events appearing within 1-2 minutes
   - Events like: `$pageview`, `$autocapture`, `web_vitals`, etc.

## Still Not Working?

If events still don't appear after following these steps:

1. Check PostHog project is in US region (https://us.i.posthog.com)
2. Verify API key is for the correct project
3. Check browser console for CORS or network errors
4. Verify ad blockers aren't blocking PostHog
5. Check PostHog project settings for IP filtering or other restrictions
