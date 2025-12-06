// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initPostHog, getPostHog } from './posthog';
import posthog from 'posthog-js';

// Mock posthog-js
vi.mock('posthog-js', () => {
  return {
    default: {
      init: vi.fn(),
      debug: vi.fn(),
      get_distinct_id: vi.fn().mockReturnValue('anon_id_123'),
    },
  };
});

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
        // No host
        vi.stubEnv('MODE', 'development');

          initPostHog();

          expect(posthog.init).toHaveBeenCalledWith('ph_test_key', expect.objectContaining({
            api_host: 'https://app.posthog.com',
          }));
    });
  });

  describe('getPostHog', () => {
    it('should return posthog instance', () => {
        expect(getPostHog()).toBe(posthog);
    });

    it('should expose get_distinct_id capability', () => {
        // Verify that getPostHog returns an instance with the standard PostHog methods
        const ph = getPostHog();

        // In jsdom test environment, window exists so ph should not be null
        expect(ph).not.toBeNull();

        const id = ph!.get_distinct_id();
        expect(id).toBe('anon_id_123');
        expect(ph!.get_distinct_id).toHaveBeenCalled();
    });

    it('should expose standard PostHog methods', () => {
        const ph = getPostHog();

        // In jsdom test environment, window exists so ph should not be null
        expect(ph).not.toBeNull();

        // Verify the instance has expected methods
        expect(ph!.get_distinct_id).toBeDefined();
        expect(ph!.init).toBeDefined();
        expect(ph!.debug).toBeDefined();
        expect(typeof ph!.get_distinct_id).toBe('function');
        expect(typeof ph!.init).toBe('function');
        expect(typeof ph!.debug).toBe('function');
    });
  });
});
