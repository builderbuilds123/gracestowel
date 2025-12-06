# PostHog Maximization Guide for Grace Stowel

**Goal:** Extract maximum observability value from PostHog to cover uptime, performance, and error monitoring needs during development.

**Last Updated:** 2025-11-28

---

## Overview

PostHog is a comprehensive product analytics platform that can serve as a unified observability solution for Grace Stowel during the development phase. This guide shows how to leverage PostHog's full capabilities beyond basic analytics.

---

## What PostHog Can Do (Beyond Product Analytics)

### ✅ User Behavior Analytics (Core Strength)
- Page views, clicks, custom events
- Funnels, retention, cohorts
- User journey mapping
- Feature flags and A/B testing

### ✅ Error Tracking
- JavaScript errors with stack traces
- Error context (user, session, page)
- Error grouping and deduplication
- Trend analysis

### ✅ Performance Monitoring
- Web Vitals (LCP, FID, CLS, TTFB)
- Page load times
- API latency tracking
- Custom performance metrics

### ✅ Session Replay
- Visual debugging of user sessions
- Replay sessions with errors
- Network requests visible
- Console logs captured

### ✅ Backend Event Tracking
- Order events via `posthog-node`
- API call tracking
- Conversion events
- Custom business metrics

### ⚠️ Basic Uptime Monitoring
- Health check events (manual implementation)
- Not real-time alerting (requires custom setup)

---

## Implementation Guide

### 1. Error Tracking with PostHog

**Enable Error Tracking:**

In your `apps/storefront/app/root.tsx`:

```typescript
import posthog from 'posthog-js';

// Initialize PostHog with error tracking
if (typeof window !== 'undefined') {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
    
    // Enable session recording
    session_recording: {
      recordCrossOriginIframes: true,
    },
    
    // Automatically capture pageviews
    capture_pageview: true,
    
    // Automatically capture performance metrics
    capture_performance: true,
    
    // Enable autocapture
    autocapture: true,
  });

  // Capture unhandled JavaScript errors
  window.addEventListener('error', (event) => {
    posthog.capture('$exception', {
      $exception_type: event.error?.name || 'Error',
      $exception_message: event.error?.message || event.message,
      $exception_stack_trace_raw: event.error?.stack || '',
      $exception_source: event.filename,
      $exception_lineno: event.lineno,
      $exception_colno: event.colno,
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    posthog.capture('$exception', {
      $exception_type: 'UnhandledPromiseRejection',
      $exception_message: event.reason?.message || String(event.reason),
      $exception_stack_trace_raw: event.reason?.stack || '',
    });
  });
}
```

**Create Error Dashboard in PostHog:**

1. Go to Insights → New Insight
2. Create trend for event `$exception`
3. Group by `$exception_type`
4. Set up alerts for error spikes

---

### 2. Performance Monitoring

**Capture Web Vitals:**

PostHog automatically captures Web Vitals with `capture_performance: true`, but you can enhance it:

```typescript
// apps/storefront/app/utils/performance.ts
import posthog from 'posthog-js';

export function trackWebVitals() {
  if (typeof window === 'undefined') return;

  // Track Largest Contentful Paint (LCP)
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    posthog.capture('web_vital_lcp', {
      value: lastEntry.renderTime || lastEntry.loadTime,
      rating: lastEntry.renderTime < 2500 ? 'good' : lastEntry.renderTime < 4000 ? 'needs-improvement' : 'poor',
    });
  }).observe({ entryTypes: ['largest-contentful-paint'] });

  // Track First Input Delay (FID)
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach((entry: any) => {
      posthog.capture('web_vital_fid', {
        value: entry.processingStart - entry.startTime,
        rating: entry.processingStart - entry.startTime < 100 ? 'good' : entry.processingStart - entry.startTime < 300 ? 'needs-improvement' : 'poor',
      });
    });
  }).observe({ entryTypes: ['first-input'] });

  // Track Cumulative Layout Shift (CLS)
  let clsValue = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as any[]) {
      if (!entry.hadRecentInput) {
        clsValue += entry.value;
      }
    }
  }).observe({ entryTypes: ['layout-shift'] });

  window.addEventListener('beforeunload', () => {
    posthog.capture('web_vital_cls', {
      value: clsValue,
      rating: clsValue < 0.1 ? 'good' : clsValue < 0.25 ? 'needs-improvement' : 'poor',
    });
  });
}

// Call in root.tsx
trackWebVitals();
```

**Track API Latency:**

```typescript
// apps/storefront/app/utils/api-monitor.ts
import posthog from 'posthog-js';

export async function monitoredFetch(url: string, options?: RequestInit) {
  const startTime = performance.now();
  
  try {
    const response = await fetch(url, options);
    const duration = performance.now() - startTime;
    
    posthog.capture('api_request', {
      url,
      method: options?.method || 'GET',
      status: response.status,
      duration_ms: duration,
      success: response.ok,
    });
    
    return response;
  } catch (error) {
    const duration = performance.now() - startTime;
    
    posthog.capture('api_request_failed', {
      url,
      method: options?.method || 'GET',
      error: (error as Error).message,
      duration_ms: duration,
    });
    
    throw error;
  }
}

// Usage
const response = await monitoredFetch('/api/products');
```

**Create Performance Dashboard:**

1. **LCP Trend**: `web_vital_lcp` grouped by `rating`
2. **FID Trend**: `web_vital_fid` grouped by `rating`
3. **CLS Trend**: `web_vital_cls` grouped by `rating`
4. **API Latency**: `api_request` → average of `duration_ms`
5. **API Error Rate**: `api_request_failed` vs `api_request`

---

### 3. Backend Monitoring with PostHog

**Install posthog-node in Backend:**

```bash
cd apps/backend
npm install posthog-node
```

**Create PostHog Client:**

```typescript
// apps/backend/src/utils/posthog.ts
import { PostHog } from 'posthog-node';

export const posthog = new PostHog(
  process.env.POSTHOG_API_KEY!,
  {
    host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
    flushAt: 1,        // Critical for serverless/Railway
    flushInterval: 0,  // Critical for serverless/Railway
  }
);

// Ensure flush on process exit
process.on('SIGTERM', async () => {
  await posthog.shutdown();
});
```

**Track Backend Events:**

```typescript
// apps/backend/src/subscribers/order-placed.ts
import { posthog } from '../utils/posthog';

export default async function orderPlacedHandler(data: any) {
  const { id, customer_id, email, total, items } = data;
  
  // Track order event
  posthog.capture({
    distinctId: customer_id || email,
    event: 'order_placed',
    properties: {
      order_id: id,
      total,
      item_count: items.length,
      currency: 'USD',
    },
  });
}
```

**Track API Errors:**

```typescript
// apps/backend/src/api/middlewares/error-handler.ts
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from '@medusajs/medusa';
import { posthog } from '../../utils/posthog';

export function errorHandlerMiddleware(
  error: Error,
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  // Track error in PostHog
  posthog.capture({
    distinctId: req.user?.id || 'anonymous',
    event: 'backend_error',
    properties: {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      endpoint: req.path,
      method: req.method,
      status_code: res.statusCode,
    },
  });
  
  next(error);
}
```

---

### 4. Basic Uptime Monitoring

**Create Health Check Event:**

```typescript
// apps/backend/src/api/health/route.ts
import type { MedusaRequest, MedusaResponse } from '@medusajs/medusa';
import { posthog } from '../../utils/posthog';

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const startTime = Date.now();
  
  try {
    // Check database
    await req.scope.resolve('manager').query('SELECT 1');
    
    // Check Redis
    const redis = req.scope.resolve('redisClient');
    await redis.ping();
    
    const uptime = Date.now() - startTime;
    
    // Track health check success
    posthog.capture({
      distinctId: 'system',
      event: 'health_check',
      properties: {
        status: 'healthy',
        response_time_ms: uptime,
        timestamp: new Date().toISOString(),
      },
    });
    
    res.status(200).json({ status: 'healthy', uptime });
  } catch (error) {
    // Track health check failure
    posthog.capture({
      distinctId: 'system',
      event: 'health_check_failed',
      properties: {
        status: 'unhealthy',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
    });
    
    res.status(500).json({ status: 'unhealthy', error: (error as Error).message });
  }
}
```

**Set Up External Monitoring:**

Use a cron job service (like EasyCron or GitHub Actions) to hit the health endpoint every minute:

```yaml
# .github/workflows/health-check.yml
name: Health Check

on:
  schedule:
    - cron: '*/1 * * * *'  # Every minute
  workflow_dispatch:

jobs:
  health-check:
    runs-on: ubuntu-latest
    steps:
      - name: Check Backend Health
        run: |
          curl -f https://your-backend.railway.app/health || exit 1
      
      - name: Check Storefront Health
        run: |
          curl -f https://your-storefront.pages.dev || exit 1
```

**Create Uptime Dashboard in PostHog:**

1. **Uptime %**: `health_check` success rate over time
2. **Response Time**: Average `response_time_ms`
3. **Downtime Alerts**: Alert on `health_check_failed` events

---

### 5. Session Replay for Debugging

**Enable Enhanced Session Recording:**

```typescript
posthog.init(key, {
  session_recording: {
    recordCrossOriginIframes: true,
    recordCanvas: true,  // Capture canvas elements
    recordHeaders: true,  // Capture request headers
    maskAllInputs: false,  // Disable if you want to see input values (be mindful of PII)
    maskTextSelector: '.sensitive-data',  // Mask specific elements
  },
});
```

**Link Errors to Session Replays:**

Errors are automatically linked to session replays. In PostHog:
1. Go to Session Recordings
2. Filter by "Sessions with errors"
3. View replay to see what user did before error

---

## PostHog Dashboards to Create

### 1. **System Health Dashboard**
- Uptime percentage (last 24h, 7d, 30d)
- Average response time
- Error rate trend
- Failed health checks

### 2. **Performance Dashboard**
- Web Vitals (LCP, FID, CLS) trends
- Page load time p50, p95, p99
- API latency by endpoint
- Slow page alerts (>3s load time)

### 3. **Error Dashboard**
- Top errors by frequency
- Error rate over time
- Errors by page/component
- Sessions with errors

### 4. **Business Metrics Dashboard**
- Orders placed
- Revenue
- Conversion rate
- Cart abandonment

---

## Alerting Setup

PostHog doesn't have built-in alerting yet (as of 2025), but you can use:

**Option 1: PostHog Webhooks + n8n/Zapier**
1. Create webhook in PostHog for specific events
2. Use n8n or Zapier to forward to Slack/Email
3. Set up conditions (e.g., >10 errors in 5 minutes)

**Option 2: PostHog API + Custom Script**
Use PostHog API to query events periodically and send alerts:

```typescript
// scripts/posthog-alerting.ts
import { PostHog } from 'posthog-node';
import nodemailer from 'nodemailer';

const posthog = new PostHog(process.env.POSTHOG_API_KEY!);

async function checkErrorRate() {
  // Query error events in last 5 minutes
  const errors = await fetch(
    `https://app.posthog.com/api/projects/${PROJECT_ID}/insights/trend/?events=[{"id":"$exception"}]&date_from=-5m`,
    {
      headers: {
        Authorization: `Bearer ${process.env.POSTHOG_API_KEY}`,
      },
    }
  ).then(res => res.json());

  if (errors.length > 10) {
    // Send alert
    await sendAlert(`High error rate: ${errors.length} errors in last 5 minutes`);
  }
}

// Run every 5 minutes
setInterval(checkErrorRate, 5 * 60 * 1000);
```

---

## Limitations & Workarounds

### ❌ No Infrastructure Metrics (CPU, RAM, Disk)

**Workaround:**
- Use Railway's built-in metrics for basic monitoring
- Track custom events (e.g., "high_memory_usage" when >80%)
- Consider adding Grafana Stack when production scaling is needed

### ❌ No Database Query Performance

**Workaround:**
- Enable Medusa's slow query logging
- Track slow queries as custom events in PostHog
- Monitor via Railway's PostgreSQL metrics

### ❌ Limited Retention (90 days on free tier)

**Workaround:**
- Upgrade to paid plan if long-term data needed
- Export critical data monthly
- Use for real-time monitoring only

---

## When to Add Grafana Stack

**Triggers to reconsider:**
1. **Production Launch**: Need deep infrastructure monitoring
2. **Performance Issues**: Database query performance debugging
3. **Scaling Challenges**: Need to optimize resource usage
4. **Compliance**: Long-term metrics retention (>90 days)
5. **Team Growth**: Multiple engineers need infrastructure visibility

**Migration Path:**
- PostHog for user-facing metrics (keep)
- Grafana Stack for infrastructure metrics (add)
- Both tools complement each other

---

## Cost Estimate

**PostHog Free Tier:**
- 1M events/month
- 90 days retention
- Unlimited team members
- Session replay included

**If you exceed free tier:**
- $0.00045/event after 1M
- Estimated: $10-50/month for growing startup

**Total Cost:** $0-50/month (vs $50-100/month for Grafana Stack)

---

## Next Steps

1. **Enable Error Tracking** (add error listeners to root.tsx)
2. **Enable Performance Monitoring** (implement Web Vitals tracking)
3. **Instrument Backend** (add posthog-node, track orders and errors)
4. **Create Dashboards** (health, performance, errors)
5. **Set Up Basic Alerting** (webhook to Slack for critical errors)
6. **Test & Iterate** (monitor for 1-2 weeks, adjust as needed)

---

## Resources

- [PostHog Documentation](https://posthog.com/docs)
- [PostHog React Integration](https://posthog.com/docs/libraries/react)
- [PostHog Cloudflare Workers](https://posthog.com/docs/libraries/cloudflare-workers)
- [PostHog Node.js SDK](https://posthog.com/docs/libraries/node)
- [Web Vitals Documentation](https://web.dev/vitals/)
