import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { getMedusaClient } from "./lib/medusa";
import { useLoaderData } from "react-router";
import { CartProvider } from "./context/CartContext";
import { MedusaCartProvider } from "./context/MedusaCartContext";
import { LocaleProvider } from "./context/LocaleContext";
import { CustomerProvider } from "./context/CustomerContext";
import { WishlistProvider } from "./context/WishlistContext";
import { CartDrawer } from "./components/CartDrawer";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ErrorBoundary as ErrorBoundaryComponent } from "./components/ErrorBoundary";

import { initPostHog, reportWebVitals, setupErrorTracking, captureException } from "./utils/posthog";
import {
  useNavigationTracking,
  useScrollTracking,
  useEngagementTracking,
  useFormTracking
} from "./hooks";
import posthog from "posthog-js";
import { createLogger } from "./lib/logger";
import { useEffect } from "react";
import "./app.css";

/**
 * PostHog Initializer Component (Issue #4 fix)
 * 
 * Moves PostHog initialization to useEffect to run after hydration.
 * Uses requestIdleCallback to defer initialization until browser is idle,
 * preventing blocking of critical rendering path.
 */
function PostHogInitializer() {
  useEffect(() => {
    // Defer to next tick to not block hydration
    const initAnalytics = () => {
      try {
        initPostHog();
        reportWebVitals();
        setupErrorTracking();
        
        // Verification (only in dev, non-blocking)
        if (import.meta.env.MODE !== 'production') {
          // Use requestIdleCallback if available, fallback to setTimeout
          const verifyInit = () => {
            const logger = createLogger({ context: "PostHogInit" });
            // @ts-expect-error - posthog might not be initialized
            const ph = window.posthog;
            if (ph && typeof ph.capture === 'function') {
              logger.info('PostHog successfully initialized', {
                distinctId: ph.get_distinct_id?.() || 'unknown'
              });
            } else {
              logger.error('PostHog NOT initialized - check API key');
            }
          };

          if ('requestIdleCallback' in window) {
            requestIdleCallback(verifyInit, { timeout: 2000 });
          } else {
            setTimeout(verifyInit, 1000);
          }
        }
      } catch (error) {
        const logger = createLogger({ context: "PostHogInit" });
        logger.error('Failed to initialize PostHog', error instanceof Error ? error : new Error(String(error)));
      }
    };

    // Wait for window.ENV to be available
    if ((window as any).ENV) {
      // Use requestIdleCallback to defer after critical work
      if ('requestIdleCallback' in window) {
        requestIdleCallback(initAnalytics, { timeout: 3000 });
      } else {
        // Fallback: defer to next tick
        setTimeout(initAnalytics, 0);
      }
    } else {
      // Wait for EnvScript to inject window.ENV
      const checkEnv = () => {
        if ((window as any).ENV) {
          if ('requestIdleCallback' in window) {
            requestIdleCallback(initAnalytics, { timeout: 3000 });
          } else {
            setTimeout(initAnalytics, 0);
          }
        } else if (document.readyState === 'loading') {
          // Only add listener if still loading
          document.addEventListener('DOMContentLoaded', checkEnv, { once: true });
        }
      };
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkEnv, { once: true });
      } else {
        // Already loaded, check immediately
        checkEnv();
      }
    }
  }, []); // Empty deps - only run once

  return null; // This component renders nothing
}

/**
 * Analytics Tracking Component (Story 5.1)
 * Wraps all tracking hooks in a single component
 * Must be rendered within router context
 */
function AnalyticsTracking() {
  useNavigationTracking();
  useScrollTracking();
  useEngagementTracking();
  useFormTracking();
  return null;
}

import { createCSRFToken, resolveCSRFSecret } from "./utils/csrf.server";
import { data } from "react-router";
import type { CloudflareEnv } from "./utils/monitored-fetch";

// ... (existing imports)

export async function loader({ request, context }: Route.LoaderArgs) {
  const logger = createLogger({ context: "root-loader" });

  // Ensure we have access to Cloudflare env
  // Cast to CloudflareEnv which includes secrets not in wrangler.json (set via dashboard)
  const env = context.cloudflare?.env as unknown as CloudflareEnv | undefined;

  if (!env) {
    throw new Error("Cloudflare environment context is not available.");
  }

  const { MEDUSA_BACKEND_URL, MEDUSA_PUBLISHABLE_KEY, JWT_SECRET } = env;
  const jwtSecret = resolveCSRFSecret(JWT_SECRET);

  if (!jwtSecret) {
    throw new Error("Missing JWT_SECRET environment variable");
  }

  if (!MEDUSA_BACKEND_URL) {
    throw new Error("Missing MEDUSA_BACKEND_URL environment variable");
  }

  // Generate CSRF Token
  const { token: csrfToken, headers: csrfHeaders } = await createCSRFToken(request, jwtSecret, env);

  // Initialize client server-side to verify config and connection
  try {
      const client = getMedusaClient({ cloudflare: { env } });
      await client.store.product.list({ limit: 1 });
      if (import.meta.env.MODE !== 'production') {
        logger.info("Medusa connection verified");
      }
  } catch (err) {
      logger.error("Failed to verify Medusa connection", err instanceof Error ? err : new Error(String(err)));
  }
  
  // Extract PostHog config
  const posthogApiKey = (env as any).VITE_POSTHOG_API_KEY || (env as any).POSTHOG_API_KEY || import.meta.env.VITE_POSTHOG_API_KEY;
  const posthogHost = (env as any).VITE_POSTHOG_HOST || (env as any).POSTHOG_HOST || import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
  
  return data({ 
    env: { 
      MEDUSA_BACKEND_URL, 
      MEDUSA_PUBLISHABLE_KEY,
      CSRF_TOKEN: csrfToken, // Expose CSRF token
      VITE_POSTHOG_API_KEY: posthogApiKey,
      VITE_POSTHOG_HOST: posthogHost,
      POSTHOG_API_KEY: posthogApiKey,
      POSTHOG_HOST: posthogHost,
    } 
  }, {
    headers: csrfHeaders // Set cookie header
  });
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&family=Sigmar+One&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <CustomerProvider>
        <MedusaCartProvider>
          <CartProvider>
            <WishlistProvider>
              <html lang="en">
                <head>
                  <meta charSet="utf-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1" />
                  <Meta />
                  <Links />
                </head>
                <body className="flex flex-col min-h-screen font-sans text-text-earthy bg-background-earthy antialiased selection:bg-accent-earthy/20">
                  <ErrorBoundaryComponent>
                    <Header />
                  </ErrorBoundaryComponent>
                  <ErrorBoundaryComponent>
                    <main className="flex-grow">
                      {children}
                    </main>
                  </ErrorBoundaryComponent>
                  <ErrorBoundaryComponent>
                    <Footer />
                  </ErrorBoundaryComponent>
                  <ErrorBoundaryComponent>
                    <CartDrawer />
                  </ErrorBoundaryComponent>

                  <ScrollRestoration />
                  <EnvScript />
                  <PostHogInitializer />
                  <Scripts />
                </body>
              </html>
            </WishlistProvider>
          </CartProvider>
        </MedusaCartProvider>
      </CustomerProvider>
    </LocaleProvider>
  );
}

function EnvScript() {
  const data = useLoaderData<typeof loader>();
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.ENV = ${JSON.stringify(data?.env || {})}`,
      }}
    />
  );
}

export default function App() {
  return (
    <>
      <AnalyticsTracking />
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  // Capture error in PostHog using standard $exception format (Story 4.1)
  // M2 fix: Use direct import instead of dynamic import to avoid missing errors
  if (typeof window !== 'undefined' && error) {
    const isRouteError = isRouteErrorResponse(error);
    const errorObj = error instanceof Error ? error : null;
    
    posthog.capture('$exception', {
      $exception_type: isRouteError ? 'RouteError' : (errorObj?.name || 'Error'),
      $exception_message: details,
      $exception_stack_trace_raw: stack,
      $exception_handled: true, // ErrorBoundary caught it
      $exception_synthetic: false,
      $exception_source: 'ErrorBoundary',
      is_route_error: isRouteError,
      route_status: isRouteError ? error.status : undefined,
      url: window.location.href,
      user_agent: navigator.userAgent,
    });
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack ? (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      ) : null}
    </main>
  );
}
