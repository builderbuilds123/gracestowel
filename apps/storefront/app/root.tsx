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
import { LocaleProvider } from "./context/LocaleContext";
import { CustomerProvider } from "./context/CustomerContext";
import { WishlistProvider } from "./context/WishlistContext";
import { CartDrawer } from "./components/CartDrawer";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { initPostHog, reportWebVitals, setupErrorTracking, captureException } from "./utils/posthog";
import { 
  useNavigationTracking, 
  useScrollTracking, 
  useEngagementTracking, 
  useFormTracking 
} from "./hooks";
import posthog from "posthog-js";
import "./app.css";

// Initialize PostHog on client-side only
if (typeof window !== 'undefined') {
  // Debug PostHog config in development/staging
  if (import.meta.env.MODE !== 'production') {
    const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
    console.log('[PostHog Init] API Key present:', !!apiKey);
    console.log('[PostHog Init] API Key length:', apiKey ? apiKey.length : 0);
    console.log('[PostHog Init] Host:', import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com');
  }
  
  initPostHog();
  reportWebVitals();
  setupErrorTracking();
  
  // Verify initialization after a short delay
  if (import.meta.env.MODE !== 'production') {
    setTimeout(() => {
      // @ts-expect-error - posthog might not be initialized
      const ph = window.posthog;
      if (ph && typeof ph.capture === 'function') {
        console.log('[PostHog Init] ✅ Successfully initialized');
        console.log('[PostHog Init] Distinct ID:', ph.get_distinct_id?.() || 'unknown');
      } else {
        console.error('[PostHog Init] ❌ PostHog NOT initialized - check API key');
      }
    }, 1000);
  }
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

export async function loader({ context }: Route.LoaderArgs) {
  // Ensure we have access to Cloudflare env
  const env = context.cloudflare?.env;

  if (!env) {
    // In dev mode or non-CF env, this might happen if not properly mocked/proxied.
    // Throwing an error makes the dependency explicit and prevents runtime errors.
    throw new Error("Cloudflare environment context is not available.");
  }

  const { MEDUSA_BACKEND_URL, MEDUSA_PUBLISHABLE_KEY } = env;

  if (!MEDUSA_BACKEND_URL) {
    throw new Error("Missing MEDUSA_BACKEND_URL environment variable");
  }

  // Initialize client server-side to verify config and connection (AC requirement)
  try {
      const client = getMedusaClient({ cloudflare: { env } });
      await client.store.product.list({ limit: 1 });
      console.log("✅ Medusa connection verified via loader");
  } catch (err) {
      console.error("❌ Failed to verify Medusa connection:", err);
  }
  
  return { 
    env: { 
      MEDUSA_BACKEND_URL, 
      MEDUSA_PUBLISHABLE_KEY 
    } 
  };
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
                <Header />
                <main className="flex-grow">
                  {children}
                </main>
                <Footer />
                <CartDrawer />
                <ScrollRestoration />
                <EnvScript />
                <Scripts />
              </body>
            </html>
          </WishlistProvider>
        </CartProvider>
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
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
