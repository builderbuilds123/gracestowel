# Infrastructure Patterns

## Kubernetes Patterns

<!-- Add your common K8s patterns here -->

## Terraform Modules

<!-- Document your reusable Terraform patterns -->

## GitHub Actions Workflows

### Dependency Caching Strategy (2025-12-08)

**Problem:** Redundant `npm ci` or `npm install` in each CI job wastes 60-90s per job.

**✅ Working Solution - Cache Only:**

Use `actions/cache@v4` to cache node_modules across jobs. Each job still runs `npm ci`, but it's much faster with a warm cache (~10-15s vs 60-90s).

```yaml
- name: Cache node_modules
  uses: actions/cache@v4
  with:
    path: node_modules
    key: ${{ runner.os }}-node-${{ env.NODE_VERSION }}-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-${{ env.NODE_VERSION }}-

- name: Install dependencies
  run: npm ci
```

**❌ Artifact Approach - DON'T USE with native binaries:**

Uploading node_modules as an artifact and downloading in other jobs **FAILS** for projects with native binaries (esbuild, sharp, swc, etc.):
- Symlinks in `node_modules/.bin/` are NOT preserved
- Binary file permissions are lost (`EACCES` errors)
- `npm rebuild` triggers install scripts that also fail

**Anti-patterns to avoid:**
- ❌ `rm -rf node_modules package-lock.json && npm install` — bypasses cache, non-deterministic
- ❌ `cache: "npm"` alone — only caches npm cache, not node_modules
- ❌ Artifact-based node_modules sharing — breaks native binaries

**Expected savings with caching:** ~40-50% reduction in dependency install wall time.

## Observability Patterns

<!-- Monitoring, alerting, and dashboard patterns -->

## Deployment Strategies

<!-- Blue-green, canary, rolling deployment patterns -->

