/**
 * Environment variables injected by Cloudflare Workers at runtime.
 * These are NOT in wrangler.jsonc to avoid overriding secrets.
 */
declare module "cloudflare:workers" {
  interface Env {
    MEDUSA_BACKEND_URL: string;
    MEDUSA_PUBLISHABLE_KEY: string;
  }
}

// Also augment the global Cloudflare namespace as fallback/primary
declare global {
  namespace Cloudflare {
    interface Env {
      MEDUSA_BACKEND_URL: string;
      MEDUSA_PUBLISHABLE_KEY: string;
    }
  }
}

export {};
