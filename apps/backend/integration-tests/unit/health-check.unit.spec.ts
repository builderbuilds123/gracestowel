import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Unit Tests for Health Check Endpoint (Story 4.5)
 */

// Mock ioredis with proper constructor
const mockRedisInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  ping: vi.fn().mockResolvedValue('PONG'),
  quit: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
};

// Use function() to enable 'new' operator
const MockRedis = vi.fn(function() {
  return mockRedisInstance;
});

vi.mock('ioredis', () => ({
  default: MockRedis,
  Redis: MockRedis,
}));

// Mock dependencies before imports
vi.mock('../../src/utils/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../src/utils/logger';

describe('Health Check Endpoint (Story 4.5)', () => {
  let mockQuery: vi.Mock;
  let mockReq: any;
  let mockRes: any;

  /**
   * Helper to reset modules and re-mock dependencies for fresh imports.
   * Reduces repetition across tests that need module isolation.
   */
  const loadGetHandler = async (customMocks?: {
    loggerInfo?: vi.Mock;
  }) => {
    vi.resetModules();
    
    // Re-mock ioredis with doMock which is not hoisted
    // Use function() to enable 'new' operator
    const MockRedisRe = vi.fn(function() {
        return mockRedisInstance;
    });

    vi.doMock('ioredis', () => ({
      default: MockRedisRe,
      Redis: MockRedisRe,
    }));
    
    // Re-mock dependencies with doMock to use local variables
    vi.doMock('../../src/utils/analytics', () => ({
      trackEvent: vi.fn(),
    }));
    vi.doMock('../../src/utils/logger', () => ({
      logger: { 
        info: customMocks?.loggerInfo ?? vi.fn(), 
        warn: vi.fn(), 
        error: vi.fn() 
      },
    }));

    const { GET } = await import('../../src/api/health/route');
    const analytics = await import('../../src/utils/analytics');
    return { GET, trackEvent: analytics.trackEvent as vi.Mock };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    
    mockQuery = vi.fn().mockResolvedValue({ data: [{ id: 'region_1' }] });
    
    mockReq = {
      scope: {
        resolve: vi.fn((name: string) => {
          if (name === 'query') return { graph: mockQuery };
          return null;
        }),
      },
    };
    
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Set up Redis URL for tests
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  describe('GET /health', () => {
    it('should return healthy status when all checks pass (AC1)', async () => {
      const { GET } = await import('../../src/api/health/route');
      
      await GET(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'healthy',
        service: 'medusa-backend',
      }));
    });

    it('should include response_time_ms in response (AC2)', async () => {
      const { GET } = await import('../../src/api/health/route');
      
      await GET(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        response_time_ms: expect.any(Number),
      }));
    });

    it('should check database connectivity (AC1)', async () => {
      const { GET } = await import('../../src/api/health/route');
      
      await GET(mockReq, mockRes);

      expect(mockQuery).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        checks: expect.objectContaining({
          database: expect.objectContaining({
            status: 'ok',
            latency_ms: expect.any(Number),
          }),
        }),
      }));
    });

    it('should report unhealthy status when database fails (AC3)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));
      
      const { GET } = await loadGetHandler();
      await GET(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'unhealthy',
        errors: expect.arrayContaining([
          expect.stringContaining('Database'),
        ]),
      }));
    });

    it('should send health_check event to analytics (AC2)', async () => {
      const { GET, trackEvent } = await loadGetHandler();
      
      await GET(mockReq, mockRes);

      expect(trackEvent).toHaveBeenCalledWith(
        mockReq.scope,
        "system.health_check",
        expect.objectContaining({
          properties: expect.objectContaining({
            status: 'healthy',
            response_time_ms: expect.any(Number),
            database_status: 'ok',
          }),
        })
      );
    });

    it('should include error details in analytics event when unhealthy (AC3)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB Error'));
      
      const { GET, trackEvent } = await loadGetHandler();
      await GET(mockReq, mockRes);

      expect(trackEvent).toHaveBeenCalledWith(
        mockReq.scope,
        "system.health_check",
        expect.objectContaining({
          properties: expect.objectContaining({
            status: 'unhealthy',
            error_count: expect.any(Number),
            errors: expect.arrayContaining([
              expect.stringContaining('Database'),
            ]),
          }),
        })
      );
    });

    it('should handle Redis not configured gracefully', async () => {
      delete process.env.REDIS_URL;
      
      const { GET } = await loadGetHandler();
      await GET(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        checks: expect.objectContaining({
          redis: expect.objectContaining({
            status: 'not_configured',
          }),
        }),
      }));
      // Should still be healthy if only Redis is not configured
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should log health check results', async () => {
      const mockLoggerInfo = vi.fn();
      const { GET } = await loadGetHandler({ loggerInfo: mockLoggerInfo });
      
      await GET(mockReq, mockRes);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'health',
        'Health check passed',
        expect.objectContaining({ response_time_ms: expect.any(Number) })
      );
    });
  });
});
