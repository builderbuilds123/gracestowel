import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMedusaClient, getMedusaClient, getBackendUrl } from './medusa';
import Medusa from "@medusajs/js-sdk";

// Mock the SDK - vitest 4.x requires class/function for `new` calls
vi.mock("@medusajs/js-sdk", () => {
  return {
    default: vi.fn().mockImplementation(function(this: { config: unknown }, config: unknown) {
      this.config = config; // Expose config for verification
    })
  };
});

describe('Medusa Client Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // @ts-ignore
    delete window.ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
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

      expect(client).toBeDefined();
    });
  });

  describe('getBackendUrl', () => {
    it('should prioritize context environment variable', () => {
      const context = { cloudflare: { env: { MEDUSA_BACKEND_URL: 'https://api.context.com' } } };
      expect(getBackendUrl(context)).toBe('https://api.context.com');
    });

    it('should fallback to window.ENV if context is missing', () => {
      // @ts-ignore
      window.ENV = { MEDUSA_BACKEND_URL: 'https://api.window.com' };
      expect(getBackendUrl()).toBe('https://api.window.com');
    });

    it('should fallback to process.env', () => {
      process.env.VITE_MEDUSA_BACKEND_URL = 'https://api.process.com';
      expect(getBackendUrl()).toBe('https://api.process.com');
    });

    it('should default to localhost', () => {
      process.env.VITE_MEDUSA_BACKEND_URL = '';
      expect(getBackendUrl()).toBe('http://localhost:9000');
    });
  });

  describe('getMedusaClient', () => {
    it('should create client with context variables', () => {
      const context = { 
        cloudflare: { 
          env: { 
            MEDUSA_BACKEND_URL: 'https://api.context.com',
            MEDUSA_PUBLISHABLE_KEY: 'pk_context'
          } 
        } 
      };
      
      getMedusaClient(context);
      
      expect(Medusa).toHaveBeenCalledWith(expect.objectContaining({
        baseUrl: 'https://api.context.com',
        publishableKey: 'pk_context'
      }));
    });

    it('should cache client instance for the same context object', () => {
      const context = { 
        cloudflare: { 
          env: { 
            MEDUSA_BACKEND_URL: 'https://api.context.com',
            MEDUSA_PUBLISHABLE_KEY: 'pk_context'
          } 
        } 
      };
      
      const client1 = getMedusaClient(context);
      const client2 = getMedusaClient(context);
      
      expect(client1).toBe(client2);
      expect(Medusa).toHaveBeenCalledTimes(1);
    });

    it('should create new client for different contexts', () => {
       const context1 = { cloudflare: { env: { MEDUSA_PUBLISHABLE_KEY: 'pk_1' } } };
       const context2 = { cloudflare: { env: { MEDUSA_PUBLISHABLE_KEY: 'pk_2' } } };
       
       getMedusaClient(context1);
       getMedusaClient(context2);
       
       expect(Medusa).toHaveBeenCalledTimes(2);
    });

    it('should use window.ENV for client-side hydration', () => {
        // @ts-ignore
        window.ENV = { MEDUSA_PUBLISHABLE_KEY: 'pk_window', MEDUSA_BACKEND_URL: 'https://api.window.com' };
        
        getMedusaClient();
        
        expect(Medusa).toHaveBeenCalledWith(expect.objectContaining({
            baseUrl: 'https://api.window.com',
            publishableKey: 'pk_window'
        }));
    });
  });
});
