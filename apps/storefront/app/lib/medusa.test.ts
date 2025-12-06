import { describe, it, expect, vi } from 'vitest';
import { createMedusaClient } from './medusa';
import Medusa from "@medusajs/js-sdk";

// Mock the SDK
vi.mock("@medusajs/js-sdk", () => {
  return {
    default: vi.fn().mockImplementation((config) => ({
      config // Expose config for verification
    }))
  };
});

describe('createMedusaClient', () => {
  it('should initialize Medusa client with correct configuration', () => {
    const backendUrl = 'http://localhost:9000';
    const publishableKey = 'pk_test_123';

    // @ts-ignore - access mock instance
    const client = createMedusaClient(backendUrl, publishableKey);
    
    // Check if constructor was called correctly
    expect(Medusa).toHaveBeenCalledWith({
      baseUrl: backendUrl,
      debug: expect.any(Boolean),
      publishableKey
    });

    // Check returned instance
    expect(client).toBeDefined();
  });
});
