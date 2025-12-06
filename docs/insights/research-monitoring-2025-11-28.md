# Technical Research: Monitoring Solutions for Grace Stowel

**Date:** 2025-11-28  
**Researcher:** BMad Master  
**Project:** Grace Stowel E-commerce Platform

---

## Executive Summary

Researched monitoring solutions for Grace Stowel to track **uptime, performance, and errors** on a hybrid Cloudflare Workers (storefront) + Railway (backend) architecture. 

**Recommended Solution:**
- **All Monitoring Needs:** PostHog (existing, expand usage)

**Rationale:** For the current development stage, PostHog provides sufficient coverage for user behavior, error tracking, performance monitoring, and basic uptime checks with zero additional cost. Grafana Stack can be considered later for production infrastructure monitoring when scaling needs arise.

**Decision Update (2025-11-28):** After careful evaluation, the team decided that PostHog alone is sufficient for current development needs. Grafana Stack POC has been archived for future reference when infrastructure monitoring becomes critical (production launch phase).

---

## Requirements

### Functional Requirements
**Uptime Monitoring:**
- Monitor storefront (Cloudflare Workers) and backend (Railway/Medusa) endpoints
- Check frequency: Every 1 minute
- SSL certificate expiration monitoring

**Performance Monitoring:**
- Page load times (storefront)
- API endpoint latency (Medusa backend)
- Database query performance
- Real User Monitoring (RUM) + Synthetic monitoring

**Error Monitoring:**
- Backend error tracking (Node.js exceptions)
- Frontend error tracking (JavaScript errors)
- API error rates (4xx/5xx)
- Stack traces and error context

**Alerting:**
- Multi-channel notifications
- Incident detection and escalation
- Customizable alert thresholds

### Non-Functional Requirements (Priorities)
- **Reliability:** High (monitoring must be stable)
- **Maintainability:** Low overhead preferred
- **Budget:** Free/open-source preferred, infrastructure costs acceptable
- **Deployment:** Railway-compatible, Railway deployment preferred but not required

### Technical Constraints
- **Stack:** React Router v7 on Cloudflare Workers + Medusa v2 on Railway
- **Timeline:** Needed during development (now)
- **Skills:** Willing to learn well-documented tools
- **Existing Tools:** PostHog (product analytics), GitHub Actions (CI/CD)

---

## Technology Options Evaluated

### 1. Grafana Stack (LGTM) - **SELECTED FOR BACKEND**

**Components:**
- **Prometheus:** Metrics collection (pull-based)
- **Mimir:** Long-term metrics storage
- **Loki:** Log aggregation
- **Tempo:** Distributed tracing
- **Grafana:** Unified visualization dashboard

**Pros:**
- ✅ Comprehensive (metrics, logs, traces)
- ✅ Industry standard, massive community
- ✅ Truly open-source (Apache 2.0)
- ✅ Railway compatible (Docker deployment)
- ✅ Powerful visualization and alerting
- ✅ Cloudflare integration via exporters
- ✅ Active development (Prometheus 3.0, Grafana v11+ in 2025)

**Cons:**
- ❌ Steep learning curve (PromQL, configuration)
- ❌ Resource intensive (~4-8GB RAM for dev, 16-32GB for prod)
- ❌ Operational overhead (maintenance, updates, tuning)
- ❌ Multiple components (complexity)
- ❌ Not plug-and-play
- ❌ Edge monitoring requires custom setup

**Resource Requirements:**
- **Dev:** 4 CPU, 8GB RAM, 50GB disk
- **Prod:** 8-16 CPU, 16-32GB RAM, 200GB disk
- **Cost (Railway):** ~$50-100/month

**Setup Effort:**
- Initial: 4-8 hours
- Ongoing: 2-4 hours/month

**Integration for Grace Stowel:**
- **Backend (Medusa/Railway):** Prometheus Node Exporter, `prom-client` for custom metrics, Loki for logs
- **Storefront (Cloudflare Workers):** Cloudflare Prometheus Exporter, Workers Analytics Engine → Grafana
- **Database/Redis:** postgres_exporter, redis_exporter

### 2. PostHog - **EXISTING, KEEP FOR USER BEHAVIOR**

**Current Usage:**
- User behavior analytics (page views, clicks, conversions)
- Product analytics (funnels, retention, cohorts)

**Cloudflare Workers Compatibility (2025):**
- ✅ Full React Router v7 integration
- ✅ Client-side session replay
- ✅ Server-side event capture via `posthog-node`
- ✅ Reverse proxy via Workers (ad-blocker bypass)
- ✅ Feature flags, A/B testing

**Limitations:**
- ❌ Session replay is client-side only
- ❌ Error tracking is basic (not their strength)
- ❌ Workers require special config (`flushAt: 1`, `flushInterval: 0`)

**Verdict:** Keep for user behavior analytics. Works excellently with your stack.

### 3. Sentry - **RECOMMENDED FOR FRONTEND ERRORS**

**Why Add Sentry:**
- Industry-standard error tracking
- Excellent Cloudflare Workers support (native SDK)
- Superior to PostHog for error debugging
- Session replay for debugging
- Stack traces, breadcrumbs, error context
- Free tier: 5K errors/month

**Integration:**
- React Router v7: Official SDK
- Cloudflare Workers: `@sentry/cloudflare`
- Backend (Node.js): `@sentry/node`

### Alternative Options Considered

**SigNoz:** All-in-one APM (OpenTelemetry-based), good alternative to Grafana Stack but less mature.

**Better Stack:** Managed service, developer-friendly, generous free tier, but not self-hosted.

**Uptime Kuma:** Dedicated uptime monitoring, simple self-hosted option for basic checks.

**Highlight.io:** All-in-one (session replay + errors + performance), could replace PostHog + Sentry but requires migration.

---

## Final Recommendation (Updated 2025-11-28)

### Architecture: PostHog-Only Approach

**All Observability via PostHog:**
```
PostHog (Unified Platform)
├── User Behavior: Page views, clicks, conversions, funnels
├── Error Tracking: JavaScript errors, stack traces, error context
├── Performance: Web Vitals, page load times, API latency
├── Session Replay: Debug user issues visually
├── Feature Flags: A/B testing, gradual rollouts
├── Backend Events: Orders, API calls (via posthog-node)
└── Basic Uptime: Health check events
```

**What PostHog Covers for Current Needs:**
- ✅ Frontend errors and performance
- ✅ User behavior analytics
- ✅ Backend conversion tracking
- ✅ Session replay for debugging
- ✅ Basic health monitoring

**What PostHog Doesn't Cover (Future Needs):**
- ❌ Infrastructure metrics (CPU, RAM, disk)
- ❌ Database query performance deep-dive
- ❌ Distributed tracing across services
- ❌ Long-term metrics retention (>90 days)

**When to Add Grafana Stack:**
- Production launch (need infrastructure monitoring)
- Scaling issues (database performance tuning)
- Compliance (long-term metrics retention)

**Archived for Future Reference:**
- Grafana Stack POC deployment guide: `docs/monitoring/archive/grafana-stack-poc-deployment-2025-11-28.md`

### Implementation Roadmap

**Phase 1: Backend Monitoring (Week 1-2)**
1. Deploy Grafana Stack on Railway (Docker Compose)
2. Configure Prometheus exporters (Node, Postgres, Redis)
3. Set up basic dashboards (CPU, memory, API latency)
4. Configure alerting (email/Slack)

**Phase 2: Frontend Error Tracking (Week 2)**
1. Add Sentry to React Router v7 storefront
2. Configure Cloudflare Workers integration
3. Set up error alerts
4. Test session replay

**Phase 3: Advanced Monitoring (Week 3-4)**
1. Add Loki for log aggregation
2. Configure Tempo for distributed tracing
3. Create custom dashboards (business metrics, SLOs)
4. Optimize Grafana performance

**Phase 4: Cloudflare Integration (Week 4)**
1. Deploy Cloudflare Prometheus Exporter
2. Create Workers-specific dashboards
3. Integrate Workers Analytics Engine

### Success Criteria

**Uptime Monitoring:**
- ✅ 1-minute check interval for storefront and backend
- ✅ SSL certificate expiration alerts
- ✅ Multi-region health checks

**Performance Monitoring:**
- ✅ API latency tracking (<200ms p95)
- ✅ Page load time monitoring (<2s)
- ✅ Database query performance visibility

**Error Monitoring:**
- ✅ Real-time error alerts
- ✅ Stack traces and error context
- ✅ Session replay for debugging

**Alerting:**
- ✅ Email/Slack notifications
- ✅ <2 minute alert latency
- ✅ Incident escalation workflows

### Cost Estimate

**Infrastructure (Railway):**
- Grafana Stack: ~$50-100/month
- Total: ~$50-100/month

**SaaS Services:**
- PostHog: $0 (current free tier)
- Sentry: $0 (free tier, 5K errors/month)
- Total: $0

**Grand Total:** ~$50-100/month

### Risk Mitigation

**Grafana Stack Complexity:**
- Mitigation: Start with Docker Compose template, use official Helm charts
- Fallback: Consider Grafana Cloud (managed) if self-hosting becomes too complex

**Resource Overhead:**
- Mitigation: Start with minimal dev setup, scale as needed
- Monitor Grafana Stack itself with Prometheus self-monitoring

**Learning Curve:**
- Mitigation: Allocate 1-2 weeks for learning and setup
- Use community dashboards and pre-built configurations

---

## Next Steps

1. **Review this research** with the team
2. **Approve budget** (~$50-100/month for Railway infrastructure)
3. **Create POC** (Grafana Stack on Railway staging environment)
4. **Implement Phase 1** (backend monitoring first)
5. **Iterate and expand** based on needs

---

## References

### Grafana Stack (2025)
- [Grafana LGTM Stack Documentation](https://grafana.com)
- [Prometheus 3.0 Release](https://prometheus.io)
- [Cloudflare Prometheus Exporter](https://github.com/lework/cloudflare-exporter)

### PostHog + Cloudflare Workers
- [PostHog Cloudflare Workers Integration](https://posthog.com/docs/libraries/cloudflare-workers)
- [PostHog React Router v7 Integration](https://posthog.com/docs/libraries/react)

### Sentry
- [Sentry Cloudflare Workers SDK](https://docs.sentry.io/platforms/javascript/guides/cloudflare-workers/)
- [Sentry React Router Integration](https://docs.sentry.io/platforms/javascript/guides/react/features/react-router/)

### Community Resources
- [Self-hosted Monitoring Comparison 2025](https://betterstack.com/community/comparisons/)
- [Grafana Stack Production Best Practices](https://grafana.com/docs/)
- [Cloudflare Workers Observability Guide](https://developers.cloudflare.com/workers/observability/)
