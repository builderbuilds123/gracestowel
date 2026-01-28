import { type LoaderFunctionArgs, type ActionFunctionArgs, data } from "react-router";
import { monitoredFetch, type CloudflareEnv } from "../../utils/monitored-fetch";
import { resolveCSRFSecret, validateCSRFToken } from "../../utils/csrf.server";
import { createLogger } from "../../lib/logger";

export async function loader({ request, context }: LoaderFunctionArgs) {
    return handleProxy(request, context);
}

export async function action({ request, params, context }: ActionFunctionArgs) {
    // CSRF Check
    const env =
        (context.cloudflare?.env as unknown as CloudflareEnv | undefined) ||
        ((context as { env?: CloudflareEnv }).env ?? {});
    const jwtSecret = resolveCSRFSecret(env.JWT_SECRET);
    if (!jwtSecret) {
        return data({ error: "Configuration error" }, { status: 500 });
    }
    const isValidCSRF = await validateCSRFToken(request, jwtSecret);
    if (!isValidCSRF) {
        return data({ error: "Invalid CSRF token" }, { status: 403 });
    }

    return handleProxy(request, context);
}

async function handleProxy(request: Request, context: any) {
    const logger = createLogger({ context: "api-proxy" });
    const url = new URL(request.url);
    const path = url.pathname.replace("/api", ""); // Strip /api prefix
    const query = url.search;

    // Get Medusa Backend URL from environment or default to localhost for dev
    const MEDUSA_BACKEND_URL = context.cloudflare?.env?.MEDUSA_BACKEND_URL || context.env?.MEDUSA_BACKEND_URL || "http://localhost:9000";
    const cloudflareEnv = context.cloudflare?.env;

    const targetUrl = `${MEDUSA_BACKEND_URL}${path}${query}`;

    // Forward request headers
    const headers = new Headers(request.headers);
    headers.set("Host", new URL(MEDUSA_BACKEND_URL).host);

    // Ensure origin is correct for CORS if needed, though server-to-server usually bypasses browser CORS
    // headers.set("Origin", MEDUSA_BACKEND_URL); 

    try {
        const response = await monitoredFetch(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.body,
            // Important: duplicate is needed to forward the body stream
            duplex: "half",
            label: "proxy-forward",
            cloudflareEnv: cloudflareEnv,
        } as any);

        // Create new headers for the response to the client
        const responseHeaders = new Headers(response.headers);

        // Handle Set-Cookie rewriting for Safari ITP / First-Party Cookies
        const setCookie = responseHeaders.get("set-cookie");
        if (setCookie) {
            // Remove Domain attribute to make it a host-only cookie (first-party)
            // Or rewrite it to the storefront domain
            const updatedCookie = setCookie.replace(/Domain=[^;]+;?/gi, "");
            responseHeaders.set("set-cookie", updatedCookie);
        }

        // Handle CORS for the client
        responseHeaders.set("Access-Control-Allow-Origin", url.origin);
        responseHeaders.set("Access-Control-Allow-Credentials", "true");

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });

    } catch (error) {
        logger.error("Proxy error", error instanceof Error ? error : new Error(String(error)), { path });
        return new Response(JSON.stringify({ error: "Backend unavailable" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
        });
    }
}
