# Infrastructure Patterns

## Kubernetes Patterns

<!-- Add your common K8s patterns here -->

## Terraform Modules

<!-- Document your reusable Terraform patterns -->

## GitHub Actions Workflows

### Dependency Caching + Artifact Strategy (2025-12-08)

**Problem:** Redundant `npm ci` or `npm install` in each CI job wastes 60-90s per job.

**Solution:** Install Once, Share via Artifact pattern:

1. **Setup Job**: Install dependencies with `actions/cache@v4` for node_modules
2. **Upload Artifact**: Use `actions/upload-artifact@v4` with 1-day retention
3. **Downstream Jobs**: Use `actions/download-artifact@v4` instead of npm install

**Key Cache Configuration:**
```yaml
- uses: actions/cache@v4
  with:
    path: node_modules
    key: ${{ runner.os }}-node-${{ env.NODE_VERSION }}-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-${{ env.NODE_VERSION }}-
```

**Anti-patterns to avoid:**
- ❌ `rm -rf node_modules package-lock.json && npm install` — bypasses cache, non-deterministic
- ❌ `cache: "npm"` alone — only caches npm cache, not node_modules
- ❌ Per-job `npm ci` — wastes time on redundant installs

**Expected savings:** 60-80% reduction in dependency install wall time.

## Observability Patterns

<!-- Monitoring, alerting, and dashboard patterns -->

## Deployment Strategies

<!-- Blue-green, canary, rolling deployment patterns -->

