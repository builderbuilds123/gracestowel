/**
 * Unit Tests for Backend Error Tracking (Story 4.4)
 */

import { captureBackendError, captureBusinessEvent, getPostHog } from '../../src/utils/posthog';

// Mock PostHog
jest.mock('posthog-node', () => ({
  PostHog: jest.fn().mockImplementation(() => ({
    capture: jest.fn(),
    shutdown: jest.fn(),
  })),
}));

describe('Backend Error Tracking (Story 4.4)', () => {
  let mockCapture: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up environment
    process.env.POSTHOG_API_KEY = 'test_api_key';
    process.env.NODE_ENV = 'test';
    
    // Get fresh client and mock
    const client = getPostHog();
    mockCapture = client?.capture as unknown as jest.Mock;
  });

  afterEach(() => {
    delete process.env.POSTHOG_API_KEY;
  });

  describe('captureBackendError', () => {
    it('should capture backend_error event with error details (AC1)', () => {
      const error = new Error('Test error message');
      error.name = 'TestError';

      captureBackendError(error, {
        component: 'test-component',
        path: '/api/test',
        method: 'POST',
      });

      expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
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

    it('should include stack trace (AC1)', () => {
      const error = new Error('Error with stack');

      captureBackendError(error);

      expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
        properties: expect.objectContaining({
          $exception_stack_trace_raw: expect.stringContaining('Error: Error with stack'),
        }),
      }));
    });

    it('should use userId as distinctId when provided', () => {
      const error = new Error('User error');

      captureBackendError(error, {
        userId: 'user_123',
      });

      expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
        distinctId: 'user_123',
      }));
    });

    it('should use "system" as distinctId when no userId provided', () => {
      const error = new Error('System error');

      captureBackendError(error);

      expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
        distinctId: 'system',
      }));
    });

    it('should include business context (orderId, paymentIntentId)', () => {
      const error = new Error('Payment failed');

      captureBackendError(error, {
        component: 'payment',
        orderId: 'order_456',
        paymentIntentId: 'pi_789',
      });

      expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
        properties: expect.objectContaining({
          order_id: 'order_456',
          payment_intent_id: 'pi_789',
        }),
      }));
    });

    it('should include environment and timestamp', () => {
      const error = new Error('Test');

      captureBackendError(error);

      expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
        properties: expect.objectContaining({
          environment: 'test',
          timestamp: expect.any(String),
        }),
      }));
    });
  });

  describe('captureBusinessEvent', () => {
    it('should capture custom business events (AC2)', () => {
      captureBusinessEvent('payment_failed', {
        payment_intent_id: 'pi_123',
        error_code: 'card_declined',
        amount: 5000,
      });

      expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
        event: 'payment_failed',
        distinctId: 'system',
        properties: expect.objectContaining({
          payment_intent_id: 'pi_123',
          error_code: 'card_declined',
          amount: 5000,
        }),
      }));
    });

    it('should use custom distinctId when provided', () => {
      captureBusinessEvent('order_cancelled', {
        order_id: 'order_123',
      }, 'customer_456');

      expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({
        distinctId: 'customer_456',
      }));
    });
  });
});
