import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getPostHog } from "../../utils/posthog"
import { logger } from "../../utils/logger"

/**
 * Health Check Response (Story 4.5)
 */
interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
  response_time_ms: number;
  checks: {
    database: { status: 'ok' | 'error'; latency_ms?: number; error?: string };
    redis: { status: 'ok' | 'error' | 'not_configured'; latency_ms?: number; error?: string };
  };
  errors?: string[];
}

/**
 * Check database connectivity by querying Medusa's container
 */
async function checkDatabase(req: MedusaRequest): Promise<{ status: 'ok' | 'error'; latency_ms?: number; error?: string }> {
  const start = performance.now();
  try {
    // Use Medusa's query to check database - simple query to verify connection
    const query = req.scope.resolve("query");
    await query.graph({
      entity: "region",
      fields: ["id"],
      pagination: { take: 1 }
    });
    return { status: 'ok', latency_ms: Math.round(performance.now() - start) };
  } catch (error) {
    return { 
      status: 'error', 
      latency_ms: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Database connection failed' 
    };
  }
}

/**
 * Check Redis connectivity using ioredis
 */
async function checkRedis(): Promise<{ status: 'ok' | 'error' | 'not_configured'; latency_ms?: number; error?: string }> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return { status: 'not_configured' };
  }

  const start = performance.now();
  try {
    // Dynamic import ioredis (used by Medusa)
    const { Redis } = await import('ioredis');
    const client = new Redis(redisUrl, { 
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
    });
    await client.connect();
    await client.ping();
    await client.quit();
    return { status: 'ok', latency_ms: Math.round(performance.now() - start) };
  } catch (error) {
    return { 
      status: 'error', 
      latency_ms: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Redis connection failed' 
    };
  }
}

/**
 * Health check endpoint for Railway deployment monitoring (Story 4.5)
 * 
 * Checks:
 * - Database connectivity (via Medusa query)
 * - Redis connectivity (if configured)
 * 
 * Reports to PostHog with status, response time, and any errors.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const startTime = performance.now();
  const errors: string[] = [];

  // Run health checks
  const [dbCheck, redisCheck] = await Promise.all([
    checkDatabase(req),
    checkRedis()
  ]);

  // Collect errors
  if (dbCheck.status === 'error') {
    errors.push(`Database: ${dbCheck.error}`);
  }
  if (redisCheck.status === 'error') {
    errors.push(`Redis: ${redisCheck.error}`);
  }

  const responseTime = Math.round(performance.now() - startTime);
  const isHealthy = dbCheck.status === 'ok' && redisCheck.status !== 'error';

  const result: HealthCheckResult = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    service: 'medusa-backend',
    timestamp: new Date().toISOString(),
    response_time_ms: responseTime,
    checks: {
      database: dbCheck,
      redis: redisCheck,
    },
  };

  if (errors.length > 0) {
    result.errors = errors;
  }

  // Track health check in PostHog (AC: report status and response time)
  try {
    const posthog = getPostHog();
    if (posthog) {
      posthog.capture({
        distinctId: 'system_health_check',
        event: 'health_check',
        properties: {
          status: result.status,
          service: result.service,
          response_time_ms: responseTime,
          database_status: dbCheck.status,
          database_latency_ms: dbCheck.latency_ms,
          redis_status: redisCheck.status,
          redis_latency_ms: redisCheck.latency_ms,
          error_count: errors.length,
          errors: errors.length > 0 ? errors : undefined,
          timestamp: result.timestamp,
        }
      });
    }
  } catch (error) {
    logger.error('health', 'Failed to track health check in PostHog', {}, error as Error);
  }

  // Log health check result
  if (isHealthy) {
    logger.info('health', 'Health check passed', { response_time_ms: responseTime });
  } else {
    logger.warn('health', 'Health check failed', { errors, response_time_ms: responseTime });
  }

  // Return appropriate status code
  res.status(isHealthy ? 200 : 503).json(result);
}

