import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { createMedusaClient } from "./lib/medusa";
import { CartProvider } from "./context/CartContext";
import { LocaleProvider } from "./context/LocaleContext";
import { CustomerProvider } from "./context/CustomerContext";
import { WishlistProvider } from "./context/WishlistContext";
import { CartDrawer } from "./components/CartDrawer";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { initPostHog, reportWebVitals } from "./utils/posthog";
import "./app.css";

// Initialize PostHog on client-side only
if (typeof window !== 'undefined') {
  initPostHog();
  reportWebVitals();
}

export async function loader({ context }: Route.LoaderArgs) {
  // Ensure we have access to Cloudflare env
  if (!context.cloudflare?.env) {
    // In dev mode or non-CF env, this might happen if not properly mocked/proxied.
    // But for this story we just want to ensure code can theoretically reach it.
    // console.warn("No Cloudflare env found in loader context");
  }

  const { MEDUSA_BACKEND_URL, MEDUSA_PUBLISHABLE_KEY } = context.cloudflare.env;

  if (!MEDUSA_BACKEND_URL) {
    throw new Error("Missing MEDUSA_BACKEND_URL environment variable");
  }

  // Initialize client server-side to verify config
  // Note: specific data fetching will happen in page loaders, this is just a quick check
  // or verifying the factory works with the env.
  // We don't necessarily need to return the client instance, just use it or pass config down if needed.
  
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
                <Scripts />
              </body>
            </html>
          </WishlistProvider>
        </CartProvider>
      </CustomerProvider>
    </LocaleProvider>
  );
}

export default function App() {
  return <Outlet />;
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

  // Capture error in PostHog
  if (typeof window !== 'undefined' && error) {
    import('./utils/posthog').then(({ default: posthog }) => {
      posthog.capture('exception', {
        properties: {
          message: message,
          details: details,
          stack: stack,
          is_route_error: isRouteErrorResponse(error),
          status: isRouteErrorResponse(error) ? error.status : undefined,
          url: window.location.href,
        }
      });
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
