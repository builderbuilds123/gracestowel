import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initPostHog, getPostHog } from './posthog';
import posthog from 'posthog-js';

// Mock posthog-js
vi.mock('posthog-js', () => {
  return {
    default: {
      init: vi.fn(),
      debug: vi.fn(),
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

    it('should initialize PostHog if API key is present', () => {
      // Mock present API key
      vi.stubEnv('VITE_POSTHOG_API_KEY', 'ph_test_key');
      vi.stubEnv('VITE_POSTHOG_HOST', 'https://test.posthog.com');
      vi.stubEnv('MODE', 'development');

      initPostHog();

      expect(posthog.init).toHaveBeenCalledWith('ph_test_key', expect.objectContaining({
        api_host: 'https://test.posthog.com',
        autocapture: true,
      }));
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
  });
});
