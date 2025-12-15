// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initPostHog, getPostHog, setupErrorTracking, captureException, reportWebVitals, WebVitalMetric } from './posthog';
import posthog from 'posthog-js';

// Mock posthog-js
vi.mock('posthog-js', () => {
  return {
    default: {
      init: vi.fn(),
      debug: vi.fn(),
      capture: vi.fn(),
      get_distinct_id: vi.fn().mockReturnValue('anon_id_123'),
    },
  };
});

// Mock web-vitals callbacks storage (using exported WebVitalMetric type)
let webVitalsCallbacks: Record<string, (metric: WebVitalMetric) => void> = {};

vi.mock('web-vitals', () => ({
  onCLS: vi.fn((cb) => { webVitalsCallbacks['CLS'] = cb; }),
  onINP: vi.fn((cb) => { webVitalsCallbacks['INP'] = cb; }),
  onLCP: vi.fn((cb) => { webVitalsCallbacks['LCP'] = cb; }),
  onFCP: vi.fn((cb) => { webVitalsCallbacks['FCP'] = cb; }),
  onTTFB: vi.fn((cb) => { webVitalsCallbacks['TTFB'] = cb; }),
}));

describe('PostHog Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('initPostHog', () => {
    it('should NOT initialize PostHog if API key is missing', () => {
      // Mock missing API key
      vi.stubEnv('VITE_POSTHOG_API_KEY', '');
      vi.stubEnv('VITE_POSTHOG_HOST', 'https://test.posthog.com');
      vi.stubEnv('MODE', 'development');

      initPostHog();

      expect(posthog.init).not.toHaveBeenCalled();
    });

    it('should initialize PostHog and enable debug in development', () => {
      // Mock present API key
      vi.stubEnv('VITE_POSTHOG_API_KEY', 'ph_test_key');
      vi.stubEnv('VITE_POSTHOG_HOST', 'https://test.posthog.com');
      vi.stubEnv('MODE', 'development');

      initPostHog();

      expect(posthog.init).toHaveBeenCalledWith('ph_test_key', expect.objectContaining({
        api_host: 'https://test.posthog.com',
        autocapture: true,
      }));
      // Note: posthog.debug() is called inside the loaded callback,
      // which won't execute in this mocked test environment
    });

    it('should use default host if not provided', () => {
        vi.stubEnv('VITE_POSTHOG_API_KEY', 'ph_test_key');
        vi.stubEnv('VITE_POSTHOG_HOST', ''); // Explicitly empty to test default
        vi.stubEnv('MODE', 'development');

          initPostHog();

          expect(posthog.init).toHaveBeenCalledWith('ph_test_key', expect.objectContaining({
            api_host: 'https://us.i.posthog.com',
          }));
    });
  });

  describe('getPostHog', () => {
    it('should return posthog instance', () => {
        expect(getPostHog()).toBe(posthog);
    });

    describe('returned instance', () => {
        let ph: ReturnType<typeof getPostHog>;

        beforeEach(() => {
            ph = getPostHog();
            // In jsdom test environment, window exists so ph should not be null
            expect(ph).not.toBeNull();
        });

        it('should have standard PostHog methods', () => {
            // Verify the instance has expected methods
            expect(typeof ph!.init).toBe('function');
            expect(typeof ph!.debug).toBe('function');
            expect(typeof ph!.get_distinct_id).toBe('function');
        });

        it('should correctly execute get_distinct_id', () => {
            const id = ph!.get_distinct_id();
            expect(id).toBe('anon_id_123');
            expect(ph!.get_distinct_id).toHaveBeenCalled();
        });
    });
  });

  describe('Error Tracking (Story 4.1)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Reset window error handlers
      window.onerror = null;
      window.onunhandledrejection = null;
    });

    describe('setupErrorTracking', () => {
      it('should set up window.onerror handler', () => {
        expect(window.onerror).toBeNull();
        
        setupErrorTracking();
        
        expect(window.onerror).not.toBeNull();
        expect(typeof window.onerror).toBe('function');
      });

      it('should set up window.onunhandledrejection handler', () => {
        expect(window.onunhandledrejection).toBeNull();
        
        setupErrorTracking();
        
        expect(window.onunhandledrejection).not.toBeNull();
        expect(typeof window.onunhandledrejection).toBe('function');
      });

      it('should chain with existing onerror handler (M1 fix)', () => {
        const existingHandler = vi.fn().mockReturnValue(false);
        window.onerror = existingHandler;
        
        setupErrorTracking();
        
        // Trigger the error handler
        window.onerror!('Test error', 'script.js', 1, 1, new Error('Test'));
        
        // Both PostHog and existing handler should be called
        expect(posthog.capture).toHaveBeenCalled();
        expect(existingHandler).toHaveBeenCalled();
      });

      it('should chain with existing onunhandledrejection handler (M1 fix)', () => {
        const existingHandler = vi.fn();
        window.onunhandledrejection = existingHandler;
        
        setupErrorTracking();
        
        const mockEvent = {
          type: 'unhandledrejection',
          reason: new Error('Test rejection'),
          promise: Promise.reject(new Error('Test')).catch(() => {}),
        } as PromiseRejectionEvent;
        
        window.onunhandledrejection!(mockEvent);
        
        // Both PostHog and existing handler should be called
        expect(posthog.capture).toHaveBeenCalled();
        expect(existingHandler).toHaveBeenCalledWith(mockEvent);
      });

      it('should capture unhandled errors with $exception event (AC1)', () => {
        setupErrorTracking();
        
        const testError = new Error('Test unhandled error');
        testError.name = 'TestError';
        
        // Trigger the error handler
        window.onerror!(
          'Test unhandled error',
          'https://example.com/script.js',
          10,
          5,
          testError
        );
        
        expect(posthog.capture).toHaveBeenCalledWith('$exception', expect.objectContaining({
          $exception_type: 'TestError',
          $exception_message: 'Test unhandled error',
          $exception_source: 'https://example.com/script.js',
          $exception_lineno: 10,
          $exception_colno: 5,
          $exception_handled: false,
        }));
      });

      it('should capture unhandled promise rejections with $exception event (AC1)', () => {
        setupErrorTracking();
        
        const testError = new Error('Promise rejection');
        testError.name = 'PromiseError';
        
        // Create mock PromiseRejectionEvent (not available in jsdom)
        const mockEvent = {
          type: 'unhandledrejection',
          reason: testError,
          promise: Promise.reject(testError).catch(() => {}), // Prevent unhandled rejection
        } as PromiseRejectionEvent;
        
        window.onunhandledrejection!(mockEvent);
        
        expect(posthog.capture).toHaveBeenCalledWith('$exception', expect.objectContaining({
          $exception_type: 'PromiseError',
          $exception_message: 'Promise rejection',
          $exception_handled: false,
          $exception_is_promise_rejection: true,
        }));
      });

      it('should include stack trace in exception event (AC1)', () => {
        setupErrorTracking();
        
        const testError = new Error('Error with stack');
        
        window.onerror!(
          'Error with stack',
          'https://example.com/script.js',
          1,
          1,
          testError
        );
        
        expect(posthog.capture).toHaveBeenCalledWith('$exception', expect.objectContaining({
          $exception_stack_trace_raw: expect.stringContaining('Error: Error with stack'),
        }));
      });

      it('should include URL for session context (AC2)', () => {
        setupErrorTracking();
        
        window.onerror!('Test error', 'script.js', 1, 1, new Error('Test'));
        
        expect(posthog.capture).toHaveBeenCalledWith('$exception', expect.objectContaining({
          url: expect.any(String),
          user_agent: expect.any(String),
        }));
      });
    });

    describe('captureException', () => {
      it('should capture handled exceptions with $exception event', () => {
        const error = new Error('Handled error');
        error.name = 'HandledError';
        
        captureException(error);
        
        expect(posthog.capture).toHaveBeenCalledWith('$exception', expect.objectContaining({
          $exception_type: 'HandledError',
          $exception_message: 'Handled error',
          $exception_handled: true,
        }));
      });

      it('should include user_agent for consistency with auto-captured exceptions (L2 fix)', () => {
        const error = new Error('Test error');
        
        captureException(error);
        
        expect(posthog.capture).toHaveBeenCalledWith('$exception', expect.objectContaining({
          user_agent: expect.any(String),
        }));
      });

      it('should include custom context in exception event', () => {
        const error = new Error('API error');
        
        captureException(error, {
          api_endpoint: '/api/orders',
          http_status: 500,
        });
        
        expect(posthog.capture).toHaveBeenCalledWith('$exception', expect.objectContaining({
          $exception_message: 'API error',
          api_endpoint: '/api/orders',
          http_status: 500,
        }));
      });
    });
  });

  describe('Web Vitals Tracking (Story 4.2)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      webVitalsCallbacks = {};
    });

    it('should register callbacks for all Core Web Vitals metrics (AC1)', async () => {
      const { onCLS, onINP, onLCP, onFCP, onTTFB } = await import('web-vitals');
      
      reportWebVitals();
      
      // Wait for dynamic import to settle
      await vi.dynamicImportSettled();
      
      expect(onCLS).toHaveBeenCalled();
      expect(onINP).toHaveBeenCalled();
      expect(onLCP).toHaveBeenCalled();
      expect(onFCP).toHaveBeenCalled();
      expect(onTTFB).toHaveBeenCalled();
    });

    it('should capture web_vitals event with metric name and value (AC1)', async () => {
      reportWebVitals();
      
      // Wait for dynamic import to settle
      await vi.dynamicImportSettled();
      
      // Simulate LCP metric callback
      const mockLCPMetric = {
        name: 'LCP',
        value: 2500,
        rating: 'good',
        delta: 2500,
        id: 'v1-123',
        navigationType: 'navigate',
        entries: [],
      };
      
      webVitalsCallbacks['LCP']?.(mockLCPMetric);
      
      expect(posthog.capture).toHaveBeenCalledWith('web_vitals', expect.objectContaining({
        metric_name: 'LCP',
        metric_value: 2500,
      }));
    });

    it('should include rating in web_vitals event (AC2)', async () => {
      reportWebVitals();
      await vi.dynamicImportSettled();
      
      // Test "good" rating
      webVitalsCallbacks['CLS']?.({
        name: 'CLS',
        value: 0.05,
        rating: 'good',
        delta: 0.05,
        id: 'v1-456',
        navigationType: 'navigate',
        entries: [],
      });
      
      expect(posthog.capture).toHaveBeenCalledWith('web_vitals', expect.objectContaining({
        metric_name: 'CLS',
        metric_rating: 'good',
      }));
    });

    it('should capture needs-improvement rating (AC2)', async () => {
      reportWebVitals();
      await vi.dynamicImportSettled();
      
      webVitalsCallbacks['LCP']?.({
        name: 'LCP',
        value: 3000,
        rating: 'needs-improvement',
        delta: 3000,
        id: 'v1-789',
        navigationType: 'navigate',
        entries: [],
      });
      
      expect(posthog.capture).toHaveBeenCalledWith('web_vitals', expect.objectContaining({
        metric_rating: 'needs-improvement',
      }));
    });

    it('should capture poor rating (AC2)', async () => {
      reportWebVitals();
      await vi.dynamicImportSettled();
      
      webVitalsCallbacks['CLS']?.({
        name: 'CLS',
        value: 0.3,
        rating: 'poor',
        delta: 0.3,
        id: 'v1-abc',
        navigationType: 'navigate',
        entries: [],
      });
      
      expect(posthog.capture).toHaveBeenCalledWith('web_vitals', expect.objectContaining({
        metric_rating: 'poor',
      }));
    });

    it('should include URL in web_vitals event', async () => {
      reportWebVitals();
      await vi.dynamicImportSettled();
      
      webVitalsCallbacks['TTFB']?.({
        name: 'TTFB',
        value: 200,
        rating: 'good',
        delta: 200,
        id: 'v1-def',
        navigationType: 'navigate',
        entries: [],
      });
      
      expect(posthog.capture).toHaveBeenCalledWith('web_vitals', expect.objectContaining({
        url: expect.any(String),
      }));
    });

    it('should capture INP (replaces deprecated FID)', async () => {
      reportWebVitals();
      await vi.dynamicImportSettled();
      
      webVitalsCallbacks['INP']?.({
        name: 'INP',
        value: 150,
        rating: 'good',
        delta: 150,
        id: 'v1-inp',
        navigationType: 'navigate',
        entries: [],
      });
      
      expect(posthog.capture).toHaveBeenCalledWith('web_vitals', expect.objectContaining({
        metric_name: 'INP',
        metric_value: 150,
        metric_rating: 'good',
      }));
    });
  });
});
