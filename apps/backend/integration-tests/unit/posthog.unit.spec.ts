import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Must mock before imports
const { MockPostHog, mockPostHogInstance } = vi.hoisted(() => {
  const instance = {
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  // Mock constructor behavior
  const MockClass = vi.fn(function() { return instance; });
  return { MockPostHog: MockClass, mockPostHogInstance: instance };
});

vi.mock('posthog-node', () => ({
  PostHog: MockPostHog,
}))

describe('PostHog Utility (Story 2.1 - AC1)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env = { ...originalEnv }
    // Ensure no lingering env vars interfere
    delete process.env.VITE_POSTHOG_API_KEY
    delete process.env.VITE_POSTHOG_HOST
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('initPostHog', () => {
    it('should initialize PostHog client with API key and host', async () => {
      process.env.POSTHOG_API_KEY = 'phc_test_key_123'
      process.env.POSTHOG_HOST = 'https://custom.posthog.com'

      const { initPostHog } = await import('../../src/utils/posthog')
      
      const client = initPostHog()

      expect(MockPostHog).toHaveBeenCalledWith('phc_test_key_123', {
        host: 'https://custom.posthog.com',
        flushAt: 1,
        flushInterval: 0,
      })
      expect(client).toBe(mockPostHogInstance)
    })

    it('should use default host when POSTHOG_HOST not set', async () => {
      process.env.POSTHOG_API_KEY = 'phc_test_key_456'
      delete process.env.POSTHOG_HOST

      const { initPostHog } = await import('../../src/utils/posthog')
      
      initPostHog()

      expect(MockPostHog).toHaveBeenCalledWith('phc_test_key_456', {
        host: 'https://app.posthog.com',
        flushAt: 1,
        flushInterval: 0,
      })
    })

    it('should return null and warn when API key not configured', async () => {
      delete process.env.POSTHOG_API_KEY

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation()
      
      const { initPostHog } = await import('../../src/utils/posthog')
      
      const client = initPostHog()

      expect(client).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PostHog] API key not configured. Server-side tracking disabled.'
      )
      expect(MockPostHog).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('should return singleton instance on subsequent calls', async () => {
      process.env.POSTHOG_API_KEY = 'phc_singleton_test'

      const { initPostHog } = await import('../../src/utils/posthog')
      
      const client1 = initPostHog()
      const client2 = initPostHog()

      expect(client1).toBe(client2)
      // Should only construct once
      expect(MockPostHog).toHaveBeenCalledTimes(1)
    })

    it('should configure flushAt:1 for serverless/Railway environment', async () => {
      process.env.POSTHOG_API_KEY = 'phc_serverless_test'

      const { initPostHog } = await import('../../src/utils/posthog')
      
      initPostHog()

      expect(MockPostHog).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          flushAt: 1,
          flushInterval: 0,
        })
      )
    })
  })

  describe('getPostHog', () => {
    it('should return existing client if initialized', async () => {
      process.env.POSTHOG_API_KEY = 'phc_get_test'

      const { initPostHog, getPostHog } = await import('../../src/utils/posthog')
      
      initPostHog()
      MockPostHog.mockClear()
      
      const client = getPostHog()

      expect(client).toBe(mockPostHogInstance)
      // Should not create new instance
      expect(MockPostHog).not.toHaveBeenCalled()
    })

    it('should initialize client on first call if not initialized', async () => {
      process.env.POSTHOG_API_KEY = 'phc_lazy_init'

      const { getPostHog } = await import('../../src/utils/posthog')
      
      const client = getPostHog()

      expect(client).toBe(mockPostHogInstance)
      expect(MockPostHog).toHaveBeenCalled()
    })
  })

  describe('shutdownPostHog', () => {
    it('should call shutdown on client and clear singleton', async () => {
      process.env.POSTHOG_API_KEY = 'phc_shutdown_test'

      const { initPostHog, shutdownPostHog, getPostHog } = await import('../../src/utils/posthog')
      
      initPostHog()
      await shutdownPostHog()

      expect(mockPostHogInstance.shutdown).toHaveBeenCalled()
      
      // After shutdown, getPostHog should re-initialize
      MockPostHog.mockClear()
      getPostHog()
      expect(MockPostHog).toHaveBeenCalled()
    })

    it('should do nothing if client not initialized', async () => {
      delete process.env.POSTHOG_API_KEY

      const { shutdownPostHog } = await import('../../src/utils/posthog')
      
      // Should not throw
      await expect(shutdownPostHog()).resolves.not.toThrow()
      expect(mockPostHogInstance.shutdown).not.toHaveBeenCalled()
    })
  })
})
