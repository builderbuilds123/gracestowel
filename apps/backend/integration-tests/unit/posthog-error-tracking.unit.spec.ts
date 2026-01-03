import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock PostHog with hoisted values
const { MockPostHog, mockPostHogInstance } = vi.hoisted(() => {
  const instance = {
    capture: vi.fn(),
    shutdown: vi.fn(),
  };
  const MockClass = vi.fn(function() { return instance; });
  return { MockPostHog: MockClass, mockPostHogInstance: instance };
});

vi.mock('posthog-node', () => ({
  PostHog: MockPostHog,
}));

describe('Backend Error Tracking (Story 4.4)', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear interfering VITE_ vars
    delete process.env.VITE_POSTHOG_API_KEY;
    delete process.env.VITE_POSTHOG_HOST;

    process.env.POSTHOG_API_KEY = 'test_api_key';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Helper to get fresh module
  async function getUtils() {
    return await import('../../src/utils/posthog');
  }

  describe('captureBackendError', () => {
    it('should capture backend_error event with error details (AC1)', async () => {
      const { captureBackendError } = await getUtils();
      
      const error = new Error('Test error message');
      error.name = 'TestError';

      captureBackendError(error, {
        component: 'test-component',
        path: '/api/test',
        method: 'POST',
      });

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(expect.objectContaining({
        event: 'backend_error',
        properties: expect.objectContaining({
          $exception_type: 'TestError',
          $exception_message: 'Test error message',
          component: 'test-component',
          path: '/api/test',
          method: 'POST',
        }),
      }));
    });

    it('should include stack trace (AC1)', async () => {
      const { captureBackendError } = await getUtils();
      const error = new Error('Error with stack');

      captureBackendError(error);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(expect.objectContaining({
        properties: expect.objectContaining({
          $exception_stack_trace_raw: expect.stringContaining('Error: Error with stack'),
        }),
      }));
    });

    it('should use userId as distinctId when provided', async () => {
      const { captureBackendError } = await getUtils();
      const error = new Error('User error');

      captureBackendError(error, {
        userId: 'user_123',
      });

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(expect.objectContaining({
        distinctId: 'user_123',
      }));
    });

    it('should use "system" as distinctId when no userId provided', async () => {
      const { captureBackendError } = await getUtils();
      const error = new Error('System error');

      captureBackendError(error);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(expect.objectContaining({
        distinctId: 'system',
      }));
    });

    it('should include business context (orderId, paymentIntentId)', async () => {
      const { captureBackendError } = await getUtils();
      const error = new Error('Payment failed');

      captureBackendError(error, {
        component: 'payment',
        orderId: 'order_456',
        paymentIntentId: 'pi_789',
      });

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(expect.objectContaining({
        properties: expect.objectContaining({
          order_id: 'order_456',
          payment_intent_id: 'pi_789',
        }),
      }));
    });

    it('should include environment and timestamp', async () => {
      const { captureBackendError } = await getUtils();
      const error = new Error('Test');

      captureBackendError(error);

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(expect.objectContaining({
        properties: expect.objectContaining({
          environment: 'test',
          timestamp: expect.any(String),
        }),
      }));
    });
  });

  describe('captureBusinessEvent', () => {
    it('should capture custom business events (AC2)', async () => {
      const { captureBusinessEvent } = await getUtils();
      captureBusinessEvent('payment_failed', {
        payment_intent_id: 'pi_123',
        error_code: 'card_declined',
        amount: 5000,
      });

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(expect.objectContaining({
        event: 'payment_failed',
        distinctId: 'system',
        properties: expect.objectContaining({
          payment_intent_id: 'pi_123',
          error_code: 'card_declined',
          amount: 5000,
        }),
      }));
    });

    it('should use custom distinctId when provided', async () => {
      const { captureBusinessEvent } = await getUtils();
      captureBusinessEvent('order_cancelled', {
        order_id: 'order_123',
      }, 'customer_456');

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith(expect.objectContaining({
        distinctId: 'customer_456',
      }));
    });
  });
});
