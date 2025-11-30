# Grafana Stack POC Deployment Guide for Grace Stowel

**Goal:** Deploy a minimal Grafana Stack (Prometheus + Grafana) on Railway to monitor the Medusa backend.

**Timeline:** 4-8 hours initial setup  
**Prerequisites:** Docker installed locally, Railway account

---

## Phase 1: Local POC Setup (2-3 hours)

### Step 1: Create Docker Compose Configuration

Create `docker-compose.monitoring.yml` in the project root:

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: gracestowel-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
    restart: unless-stopped
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: gracestowel-grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=changeme123  # CHANGE THIS
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_ROOT_URL=http://localhost:3000
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
    depends_on:
      - prometheus
    restart: unless-stopped
    networks:
      - monitoring

volumes:
  prometheus-data:
  grafana-data:

networks:
  monitoring:
    driver: bridge
```

### Step 2: Create Prometheus Configuration

Create `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'gracestowel-dev'
    environment: 'development'

# Alertmanager configuration (optional for POC)
alerting:
  alertmanagers:
    - static_configs:
        - targets: []

# Scrape configurations
scrape_configs:
  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Medusa backend metrics (once instrumented)
  - job_name: 'medusa-backend'
    static_configs:
      - targets: ['host.docker.internal:9000']  # Adjust if backend runs on different port
    metrics_path: '/metrics'
    scrape_interval: 10s

  # Node Exporter (if added later)
  # - job_name: 'node'
  #   static_configs:
  #     - targets: ['node-exporter:9100']

  # PostgreSQL Exporter (if added later)
  # - job_name: 'postgres'
  #   static_configs:
  #     - targets: ['postgres-exporter:9187']

  # Redis Exporter (if added later)
  # - job_name: 'redis'
  #   static_configs:
  #     - targets: ['redis-exporter:9121']
```

### Step 3: Create Grafana Data Source Provisioning

Create `monitoring/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
    jsonData:
      timeInterval: '15s'
```

### Step 4: Instrument Medusa Backend

Install Prometheus client in backend:

```bash
cd apps/backend
npm install prom-client
```

Create `apps/backend/src/metrics/prometheus.ts`:

```typescript
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({
  register,
  prefix: 'medusa_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// Custom metrics
export const httpRequestDuration = new Histogram({
  name: 'medusa_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestsTotal = new Counter({
  name: 'medusa_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const ordersTotal = new Counter({
  name: 'medusa_orders_total',
  help: 'Total number of orders',
  labelNames: ['status'],
  registers: [register],
});

export const databaseQueryDuration = new Histogram({
  name: 'medusa_database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});
```

Create metrics endpoint `apps/backend/src/api/metrics/route.ts`:

```typescript
import type { MedusaRequest, MedusaResponse } from '@medusajs/medusa';
import { register } from '../../metrics/prometheus';

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  } catch (error) {
    res.status(500).send({ error: 'Failed to collect metrics' });
  }
}
```

Add middleware to track HTTP requests `apps/backend/src/api/middlewares/prometheus.ts`:

```typescript
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from '@medusajs/medusa';
import { httpRequestDuration, httpRequestsTotal } from '../../metrics/prometheus';

export async function prometheusMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const method = req.method;
    const statusCode = res.statusCode.toString();

    httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );

    httpRequestsTotal.inc({ method, route, status_code: statusCode });
  });

  next();
}
```

Register middleware in `apps/backend/src/api/middlewares.ts`:

```typescript
import { defineMiddlewares } from '@medusajs/medusa';
import { prometheusMiddleware } from './middlewares/prometheus';

export default defineMiddlewares({
  routes: [
    {
      matcher: '*',
      middlewares: [prometheusMiddleware],
    },
  ],
});
```

### Step 5: Start Local Monitoring Stack

```bash
# Start monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d

# Verify services
docker-compose -f docker-compose.monitoring.yml ps

# Check Prometheus targets
open http://localhost:9090/targets

# Access Grafana
open http://localhost:3000
# Login: admin / changeme123
```

### Step 6: Test Metrics Collection

```bash
# Test backend metrics endpoint
curl http://localhost:9000/metrics

# Generate some traffic to create metrics
curl http://localhost:9000/store/products

# Check Prometheus for metrics
open http://localhost:9090/graph
# Query: medusa_http_requests_total
```

### Step 7: Import Basic Dashboard

In Grafana:
1. Go to Dashboards → Import
2. Use Dashboard ID `1860` (Node Exporter Full) for system metrics
3. Create custom dashboard for Medusa:
   - Add panel for `rate(medusa_http_requests_total[5m])`
   - Add panel for `medusa_http_request_duration_seconds`
   - Add panel for `medusa_orders_total`

---

## Phase 2: Railway Deployment (2-3 hours)

### Step 1: Prepare for Railway

Create `railway.json` for Railway deployment:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile.monitoring"
  },
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

Create `Dockerfile.monitoring` (multi-stage build for both Prometheus and Grafana):

**Option 1: Deploy Prometheus and Grafana Separately (Recommended)**

Create two Railway services:

**Service 1: Prometheus**

`Dockerfile.prometheus`:

```dockerfile
FROM prom/prometheus:latest

COPY monitoring/prometheus.yml /etc/prometheus/prometheus.yml

EXPOSE 9090

CMD ["--config.file=/etc/prometheus/prometheus.yml", \
     "--storage.tsdb.path=/prometheus", \
     "--storage.tsdb.retention.time=15d", \
     "--web.enable-lifecycle"]
```

**Service 2: Grafana**

`Dockerfile.grafana`:

```dockerfile
FROM grafana/grafana:latest

# Copy provisioning configs
COPY monitoring/grafana/provisioning /etc/grafana/provisioning

EXPOSE 3000

# Environment variables will be set in Railway
```

### Step 2: Deploy to Railway

**Deploy Prometheus:**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link project
railway link

# Create Prometheus service
railway up --service prometheus -d Dockerfile.prometheus

# Set environment variables (in Railway dashboard)
# No specific env vars needed for Prometheus
```

**Deploy Grafana:**

```bash
# Create Grafana service
railway up --service grafana -d Dockerfile.grafana

# Set environment variables in Railway dashboard:
# GF_SECURITY_ADMIN_USER=admin
# GF_SECURITY_ADMIN_PASSWORD=<strong-password>
# GF_SERVER_ROOT_URL=https://<your-railway-domain>
# PROMETHEUS_URL=http://prometheus.railway.internal:9090
```

### Step 3: Configure Prometheus Data Source in Railway

Update `monitoring/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: ${PROMETHEUS_URL}  # Railway internal URL
    isDefault: true
    editable: false
    jsonData:
      timeInterval: '15s'
```

### Step 4: Update Backend to Report to Railway Prometheus

Update backend environment variables in Railway:

```
PROMETHEUS_PUSH_GATEWAY=<prometheus-railway-url>:9090
```

Or configure Prometheus to scrape backend via Railway internal networking:

```yaml
scrape_configs:
  - job_name: 'medusa-backend'
    static_configs:
      - targets: ['backend.railway.internal:9000']
```

### Step 5: Set Up Persistent Storage

In Railway dashboard:
1. Add volume to Prometheus service: `/prometheus` (for metrics data)
2. Add volume to Grafana service: `/var/lib/grafana` (for dashboards/settings)

### Step 6: Configure Alerting (Optional)

Create `monitoring/alerting-rules.yml`:

```yaml
groups:
  - name: backend_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(medusa_http_requests_total{status_code=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} requests/s"

      - alert: SlowResponseTime
        expr: histogram_quantile(0.95, rate(medusa_http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow response time"
          description: "P95 latency is {{ $value }}s"

      - alert: ServiceDown
        expr: up{job="medusa-backend"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Medusa backend is down"
          description: "Backend has been down for more than 1 minute"
```

---

## Phase 3: Sentry Integration (1-2 hours)

### Step 1: Create Sentry Account

1. Sign up at https://sentry.io
2. Create new project: "Grace Stowel Storefront"
3. Copy DSN

### Step 2: Install Sentry in Storefront

```bash
cd apps/storefront
npm install @sentry/react @sentry/cloudflare
```

### Step 3: Initialize Sentry

Create `apps/storefront/app/utils/sentry.client.ts`:

```typescript
import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

export function initSentry() {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration(),
    ],

    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of transactions (reduce in prod)

    // Session Replay
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
  });
}
```

Update `apps/storefront/app/root.tsx`:

```typescript
import { initSentry } from './utils/sentry.client';

// Initialize Sentry on client-side only
if (typeof window !== 'undefined') {
  initSentry();
}
```

### Step 4: Add Sentry to Cloudflare Workers

Create `apps/storefront/functions/[[path]].ts` (if using Cloudflare Pages Functions):

```typescript
import * as Sentry from '@sentry/cloudflare';

export const onRequest: PagesFunction = async (context) => {
  Sentry.init({
    dsn: context.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  });

  try {
    return await context.next();
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
};
```

### Step 5: Test Sentry Integration

Add test error button in development:

```typescript
// components/TestSentryButton.tsx
import * as Sentry from '@sentry/react';

export function TestSentryButton() {
  if (import.meta.env.MODE !== 'development') return null;

  return (
    <button
      onClick={() => {
        throw new Error('Test Sentry Error');
      }}
    >
      Test Sentry
    </button>
  );
}
```

---

## Phase 4: Validation & Testing (1 hour)

### Validation Checklist

**Prometheus:**
- [ ] Prometheus UI accessible
- [ ] Backend metrics endpoint scraped successfully
- [ ] Metrics appearing in Prometheus queries
- [ ] Retention policy working (15 days)

**Grafana:**
- [ ] Grafana UI accessible
- [ ] Prometheus data source connected
- [ ] Can query metrics in dashboard
- [ ] Admin credentials changed from default

**Backend Metrics:**
- [ ] `/metrics` endpoint returns data
- [ ] HTTP request metrics incrementing
- [ ] Response time metrics accurate
- [ ] Custom business metrics working

**Sentry:**
- [ ] Test error captured in Sentry dashboard
- [ ] Stack trace visible
- [ ] Session replay working
- [ ] Source maps uploaded (if applicable)

### Performance Testing

```bash
# Generate load to test metrics
hey -n 1000 -c 10 http://localhost:9000/store/products

# Check metrics in Grafana
# Verify:
# - Request rate increases
# - Latency p95/p99 within acceptable range
# - Error rate stays at 0%
```

---

## Troubleshooting

### Prometheus Not Scraping Backend

**Issue:** Targets show "down" in Prometheus  
**Solution:**
- Check backend `/metrics` endpoint is accessible
- Verify `host.docker.internal` resolves (Docker Desktop may need enabling)
- Use `docker network inspect` to check networking

### Grafana Can't Connect to Prometheus

**Issue:** Data source test fails  
**Solution:**
- Verify Prometheus URL (should be `http://prometheus:9090` in Docker)
- Check Docker network connectivity
- Restart Grafana container

### Sentry Not Capturing Errors

**Issue:** Errors not appearing in Sentry dashboard  
**Solution:**
- Check DSN is correct
- Verify Sentry.init() is being called
- Check browser console for Sentry warnings
- Ensure not blocking sentry.io in ad-blocker

---

## Next Steps After POC

1. **Expand Monitoring:**
   - Add Loki for log aggregation
   - Add Tempo for distributed tracing
   - Add Postgres/Redis exporters

2. **Create Production Dashboards:**
   - Business metrics (orders, revenue)
   - SLO tracking (availability, latency)
   - Error budgets

3. **Set Up Alerting:**
   - Configure Alertmanager
   - Integrate with Slack/Email
   - Define runbooks for common alerts

4. **Optimize:**
   - Tune Prometheus retention
   - Optimize Grafana query performance
   - Set up high avail ability (if needed)

5. **Documentation:**
   - Create runbook for common issues
   - Document dashboard meanings
   - Train team on using monitoring tools

---

## Cost Estimation

**Railway (Monthly):**
- Prometheus (2GB RAM, 1 CPU): ~$20-30
- Grafana (1GB RAM, 0.5 CPU): ~$15-20
- **Total:** ~$35-50/month

**Sentry:**
- Free tier: 5K errors/month
- If exceeded: ~$26/month for 50K errors

**Total Monthly Cost:** ~$35-76/month

---

## Support & Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Sentry React Documentation](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Railway Documentation](https://docs.railway.app/)
- [Medusa Monitoring Guide](https://docs.medusajs.com/development/monitoring)
