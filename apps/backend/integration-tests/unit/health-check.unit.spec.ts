/**
 * Unit Tests for Health Check Endpoint (Story 4.5)
 */

// Mock ioredis with proper constructor
const mockRedisInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => mockRedisInstance),
}));

// Mock dependencies before imports
jest.mock('../../src/utils/posthog', () => ({
  getPostHog: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { getPostHog } from '../../src/utils/posthog';
import { logger } from '../../src/utils/logger';

describe('Health Check Endpoint (Story 4.5)', () => {
  let mockCapture: jest.Mock;
  let mockQuery: jest.Mock;
  let mockReq: any;
  let mockRes: any;

  /**
   * Helper to reset modules and re-mock dependencies for fresh imports.
   * Reduces repetition across tests that need module isolation.
   */
  const loadGetHandler = async (customMocks?: {
    loggerInfo?: jest.Mock;
  }) => {
    jest.resetModules();
    
    // Re-mock ioredis
    jest.mock('ioredis', () => ({
      Redis: jest.fn().mockImplementation(() => mockRedisInstance),
    }));
    
    // Re-mock dependencies
    jest.mock('../../src/utils/posthog', () => ({
      getPostHog: jest.fn(() => ({ capture: mockCapture })),
    }));
    jest.mock('../../src/utils/logger', () => ({
      logger: { 
        info: customMocks?.loggerInfo ?? jest.fn(), 
        warn: jest.fn(), 
        error: jest.fn() 
      },
    }));

    const { GET } = await import('../../src/api/health/route');
    return GET;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockCapture = jest.fn();
    (getPostHog as jest.Mock).mockReturnValue({ capture: mockCapture });
    
    mockQuery = jest.fn().mockResolvedValue({ data: [{ id: 'region_1' }] });
    
    mockReq = {
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === 'query') return { graph: mockQuery };
          return null;
        }),
      },
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
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
      
      const GET = await loadGetHandler();
      await GET(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'unhealthy',
        errors: expect.arrayContaining([
          expect.stringContaining('Database'),
        ]),
      }));
    });

    it('should send health_check event to PostHog (AC2)', async () => {
      const { GET } = await import('../../src/api/health/route');
      
      await GET(mockReq, mockRes);

      expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
        distinctId: 'system_health_check',
        event: 'health_check',
        properties: expect.objectContaining({
          status: 'healthy',
          response_time_ms: expect.any(Number),
          database_status: 'ok',
        }),
      }));
    });

    it('should include error details in PostHog event when unhealthy (AC3)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB Error'));
      
      const GET = await loadGetHandler();
      await GET(mockReq, mockRes);

      expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
        properties: expect.objectContaining({
          status: 'unhealthy',
          error_count: expect.any(Number),
          errors: expect.arrayContaining([
            expect.stringContaining('Database'),
          ]),
        }),
      }));
    });

    it('should handle Redis not configured gracefully', async () => {
      delete process.env.REDIS_URL;
      
      const GET = await loadGetHandler();
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
      const mockLoggerInfo = jest.fn();
      const GET = await loadGetHandler({ loggerInfo: mockLoggerInfo });
      
      await GET(mockReq, mockRes);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'health',
        'Health check passed',
        expect.objectContaining({ response_time_ms: expect.any(Number) })
      );
    });
  });
});
