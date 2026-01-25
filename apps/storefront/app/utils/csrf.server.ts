import { createCookie } from "react-router";
import { createLogger } from "../lib/logger";

const logger = createLogger({ context: "csrf" });

export function resolveCSRFSecret(secret?: string): string | null {
  const isProd =
    (typeof process !== "undefined" && process.env.NODE_ENV === "production") ||
    import.meta.env.PROD;

  if (!secret) {
    if (isProd) {
      return null;
    }
    logger.warn("JWT_SECRET not set; using development CSRF fallback");
    return "dev-secret-key";
  }

  return secret;
}

export const getCSRFCookie = (secret: string, isProd: boolean, isCI: boolean) => createCookie("csrf_token", {
  path: "/",
  httpOnly: true,
  secure: isProd && !isCI,
  sameSite: "lax",
  secrets: [secret],
  maxAge: 60 * 60 * 24, // 1 day
});

export async function createCSRFToken(request: Request, secret?: string, env?: any) {
    const isProd = (env?.ENVIRONMENT === 'production') || (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') || import.meta.env.PROD;
    const isCI = (String(env?.CI) === 'true') || (typeof process !== 'undefined' && String(process.env.CI) === 'true');
    
    const resolvedSecret = resolveCSRFSecret(secret || env?.JWT_SECRET);
    if (!resolvedSecret) {
        throw new Error("JWT_SECRET not configured for CSRF");
    }
    const cookie = getCSRFCookie(resolvedSecret, isProd, isCI);
    const cookieHeader = request.headers.get("Cookie");
    const session = (await cookie.parse(cookieHeader)) || {};
    
    let token = session.token;
    const headers = new Headers();
    
    if (!token) {
        token = crypto.randomUUID();
        headers.append("Set-Cookie", await cookie.serialize({ token }));
    }
    
    return { token, headers };
}

export async function validateCSRFToken(request: Request, secret?: string, env?: any) {
    const isProd = (env?.ENVIRONMENT === 'production') || (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') || import.meta.env.PROD;
    const isCI = (String(env?.CI) === 'true') || (typeof process !== 'undefined' && String(process.env.CI) === 'true');

    const resolvedSecret = resolveCSRFSecret(secret || env?.JWT_SECRET);
    if (!resolvedSecret) {
        throw new Error("JWT_SECRET not configured for CSRF");
    }
    const cookie = getCSRFCookie(resolvedSecret, isProd, isCI);
    const cookieHeader = request.headers.get("Cookie");
    const session = (await cookie.parse(cookieHeader)) || {};
    const storedToken = typeof session.token === 'string' ? session.token : undefined;

    // Check header first (for API requests)
    let submittedToken = request.headers.get("X-CSRF-Token");

    // If not in header, check form data (for HTML form submissions)
    // Clone request to avoid consuming the body for the actual handler
    if (!submittedToken) {
        try {
            const clonedRequest = request.clone();
            const contentType = clonedRequest.headers.get("Content-Type") || "";

            if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
                const formData = await clonedRequest.formData();
                const formToken = formData.get("csrf_token");
                if (typeof formToken === "string") {
                    submittedToken = formToken;
                }
            }
        } catch (e) {
            // If parsing fails, continue with header-only check
            logger.warn("Failed to parse form data for CSRF token", { error: String(e) });
        }
    }

    if (!isProd || isCI) {
        const storedDisplay = typeof storedToken === 'string' ? `${storedToken.substring(0, 8)}...` : 'undefined';
        const submittedDisplay = typeof submittedToken === 'string' ? `${submittedToken.substring(0, 8)}...` : 'undefined';
        logger.info("CSRF validation", {
            storedTokenPreview: storedDisplay,
            submittedTokenPreview: submittedDisplay,
            match: storedToken === submittedToken,
            hasCookie: !!storedToken,
            source: request.headers.get("X-CSRF-Token") ? "header" : "form",
        });
    }

    if (!storedToken || !submittedToken) return false;

    return storedToken === submittedToken;
}
