# Claude Code Review Setup Guide

This guide walks through setting up automatic PR code review using Claude Code Action in the gracestowel repository.

## Overview

The Claude Code Review workflow automatically reviews all PRs with:
- Enhanced progress tracking (like v0.x with status updates)
- Inline comments on specific code issues
- Architecture, security, and testing analysis
- Epic/story alignment validation
- Focused test execution

## Prerequisites

- GitHub repository admin access
- Anthropic API account with production-tier access
- Existing CI/CD pipeline (already configured in `.github/workflows/ci.yml`)

## Setup Steps

### 1. Generate Anthropic API Key

1. Visit the Anthropic Console: https://console.anthropic.com/settings/keys
2. Click **"Create Key"**
3. Configure the key:
   - **Name:** `gracestowel-github-actions`
   - **Tier:** Production (recommended for reliability)
   - **Rate Limits:** Default (1000 requests/min)
4. Copy the API key (starts with `sk-ant-api03-...`)
   - ⚠️ **Important:** You won't be able to see this key again!

### 2. Add API Key to GitHub Secrets

**Option A: Via GitHub UI (Recommended)**

1. Go to repository **Settings**
2. Navigate to **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Configure:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Secret:** Paste your API key (`sk-ant-api03-...`)
5. Click **Add secret**

**Option B: Via GitHub CLI**

```bash
# Make sure you're in the repo directory
cd /path/to/gracestowel

# Add the secret
gh secret set ANTHROPIC_API_KEY

# Paste your API key when prompted
# Press Enter, then Ctrl+D to save
```

**Verify Secret Added:**

```bash
gh secret list
# Should show:
# ANTHROPIC_API_KEY  Updated 2025-XX-XX
```

### 3. Verify Workflow Files

The following files should exist:

```bash
# Check workflow file exists
ls -la .github/workflows/claude-code-review.yml

# Check prompt template exists
ls -la .github/prompts/code-review-prompt.md
```

If these files don't exist, they were created in the implementation step.

### 4. Test the Workflow

**Create a Test PR:**

```bash
# Create a test branch
git checkout -b test/claude-code-review-setup

# Make a small change
echo "# Claude Code Review Test" >> docs/guides/test-claude-review.md
git add docs/guides/test-claude-review.md
git commit -m "test: verify Claude code review workflow"

# Push and create PR
git push origin test/claude-code-review-setup
gh pr create \
  --title "Test: Claude Code Review Workflow" \
  --body "Testing automated Claude code review integration" \
  --base main
```

**Monitor the Workflow:**

```bash
# Watch workflow execution in real-time
gh run watch

# Or view in GitHub UI:
# Actions tab > Claude Code Review
```

**Expected Behavior:**

1. **prepare-context job** runs immediately:
   - Analyzes changed files
   - Determines review scope
   - Extracts epic context (if any)

2. **wait-for-lint job** waits for CI validation:
   - Watches for `Validate` job from `ci.yml`
   - Proceeds when linting passes

3. **claude-review job** runs Claude review:
   - Posts initial "Review in progress" comment
   - Analyzes code with inline comments
   - Posts final summary with findings
   - Runs focused tests if applicable

**Check PR Comments:**

```bash
# View all comments on the PR
gh pr view [PR_NUMBER] --comments
```

You should see:
- Initial progress tracking comment
- Inline comments on code (if issues found)
- Final summary comment with review results

### 5. Staged Rollout Plan

**Week 1: Test PRs Only**

Keep workflow on test branches:
```yaml
# In .github/workflows/claude-code-review.yml
on:
  pull_request:
    branches: [test/*]  # Only test branches
```

**Week 2: Staging Branch**

Enable for staging PRs:
```yaml
on:
  pull_request:
    branches: [staging]  # Production-like environment
```

**Week 3+: Full Production**

Enable for all branches:
```yaml
on:
  pull_request:
    branches: [main, staging]  # Current configuration
```

## Configuration

### Workflow Triggers

The workflow runs on:
- `opened` - New PR created
- `synchronize` - New commits pushed to PR
- `ready_for_review` - Draft PR marked ready
- `reopened` - Closed PR reopened

**Excluded:**
- Draft PRs (only runs when marked ready)
- PRs to branches other than `main` or `staging`

### Review Scope Detection

The workflow automatically detects:
- **Backend only:** Changes to `apps/backend/**`
- **Storefront only:** Changes to `apps/storefront/**`
- **E2E only:** Changes to `apps/e2e/**`
- **Full:** Changes across multiple apps

Claude adjusts review focus based on scope.

### Epic/Story Context

The workflow extracts epic context from PR:
- Checks PR title for patterns: `Epic 1.2`, `Story 3.4`, `5-2`
- Loads corresponding story file from `docs/sprint/sprint-artifacts/`
- Validates acceptance criteria implementation
- Suggests missing test cases

### Tool Access

Claude has access to:
- `mcp__github_inline_comment__create_inline_comment` - Post inline code comments
- `gh pr comment`, `gh pr view`, `gh pr diff` - PR operations
- `Read`, `Grep`, `Glob` - File analysis
- `git` - Diff and history operations
- `pnpm` - Test execution

## Cost Management

### Estimated Costs

**Per Review:**
- Input tokens: ~20,000 (reading code, docs, prompt)
- Output tokens: ~4,000 (comments and analysis)
- Cost: ~$1.20 per review (Claude Sonnet 4.5 pricing)

**Monthly Estimate:**
- 100 PRs/month: ~$120/month
- 200 PRs/month: ~$240/month

### Cost Optimization

**Already Implemented:**
- `max_tokens: 16000` limits output token costs
- `cancel-in-progress: true` prevents duplicate reviews
- Workflow skips draft PRs

**Monitor Usage:**
- Anthropic Console: https://console.anthropic.com/settings/usage
- Track costs by day/month
- Set budget alerts if needed

## Troubleshooting

### Workflow Not Running

**Check:**
1. PR is not a draft
2. PR targets `main` or `staging` branch
3. `ANTHROPIC_API_KEY` secret exists

```bash
# Verify secret
gh secret list | grep ANTHROPIC_API_KEY

# Check workflow file syntax
yamllint .github/workflows/claude-code-review.yml
```

### API Key Issues

**Error:** "Invalid API key"

**Solution:**
```bash
# Generate new key in Anthropic Console
# Update secret
gh secret set ANTHROPIC_API_KEY
# Paste new key
```

### Workflow Fails on "wait-for-lint"

**Error:** "Validation job not found"

**Cause:** CI workflow renamed or disabled

**Solution:**
Update `check-name` in workflow:
```yaml
- name: Wait for CI validation
  uses: lewagon/wait-on-check-action@v1.3.4
  with:
    check-name: 'Validate'  # Match your ci.yml job name
```

### No Inline Comments Posted

**Possible Causes:**
1. No issues found (check summary comment)
2. MCP tool permission issue
3. File paths don't match PR changes

**Debug:**
Check workflow logs:
```bash
gh run view [RUN_ID] --log
```

### Test Execution Fails

The workflow uses `continue-on-error: true` for tests, so this won't block reviews.

**Check:**
- Test command matches your package.json scripts
- Dependencies installed correctly
- Test environment configured

## Monitoring & Maintenance

### Weekly Checks

```bash
# View recent workflow runs
gh run list --workflow=claude-code-review.yml --limit 20

# Check success rate
gh run list --workflow=claude-code-review.yml --status=success
gh run list --workflow=claude-code-review.yml --status=failure

# Review API usage in Anthropic Console
```

### Monthly Review

- Analyze false positive/negative rates
- Update prompt template based on feedback
- Review cost trends
- Gather team feedback on usefulness

### Update Prompt

To improve review quality:

```bash
# Edit prompt template
vim .github/prompts/code-review-prompt.md

# Commit changes
git add .github/prompts/code-review-prompt.md
git commit -m "docs: update Claude review prompt"
git push
```

Changes take effect immediately on next PR.

## Rollback Plan

### Temporary Disable

```bash
# Disable workflow (keep file)
mv .github/workflows/claude-code-review.yml \
   .github/workflows/claude-code-review.yml.disabled

git add .github/workflows/
git commit -m "chore: temporarily disable Claude code review"
git push
```

### Re-enable

```bash
mv .github/workflows/claude-code-review.yml.disabled \
   .github/workflows/claude-code-review.yml

git add .github/workflows/
git commit -m "chore: re-enable Claude code review"
git push
```

### Permanent Removal

```bash
git rm .github/workflows/claude-code-review.yml
git rm .github/prompts/code-review-prompt.md
git commit -m "chore: remove Claude code review"
git push
```

## Team Guidelines

### For PR Authors

**What to Expect:**
- Claude will review your PR after linting passes
- You'll receive inline comments on code issues
- A summary comment with overall findings
- Reviews are advisory, not blocking

**Best Practices:**
- Reference epic/story in PR title (e.g., "feat: Story 5-2 - Frontend Tracking")
- Provide clear PR description
- Address critical issues (🔴) before requesting human review
- Treat warnings (🟡) as suggestions to consider

### For Reviewers

**Claude's Role:**
- First-pass code review
- Catches common issues
- Validates architecture patterns
- Complements human review (doesn't replace it)

**Your Role:**
- Review business logic and requirements
- Assess overall design decisions
- Mentor and provide context
- Make final merge decision

## Support

**Issues with Workflow:**
- Check workflow logs: `gh run view --log`
- Review setup guide: `docs/guides/claude-code-review-setup.md`
- Open issue in repo with workflow run ID

**Issues with Anthropic API:**
- Visit: https://console.anthropic.com/settings/support
- Check status: https://status.anthropic.com/

**Feature Requests:**
- Propose changes to prompt template
- Suggest new review dimensions
- Share feedback with team

## Next Steps

After successful setup:

1. **Monitor First 10 PRs:**
   - Review quality of Claude's feedback
   - Note false positives/negatives
   - Gather team feedback

2. **Iterate on Prompt:**
   - Adjust severity thresholds
   - Add domain-specific patterns
   - Refine review dimensions

3. **Consider Phase 2 Enhancements:**
   - Add blocking rules for critical issues
   - Integrate with issue tracking
   - Custom review checklists per epic

4. **Share Results:**
   - Document value provided
   - Calculate ROI (time saved vs cost)
   - Celebrate wins with team

---

**Questions?** Check the [plan file](/Users/leonliang/.claude/plans/enchanted-sparking-rabin.md) for detailed implementation notes.
