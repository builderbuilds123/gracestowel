import { createCookie } from "react-router";

export function resolveCSRFSecret(secret?: string): string | null {
  const isProd =
    (typeof process !== "undefined" && process.env.NODE_ENV === "production") ||
    import.meta.env.PROD;

  if (!secret) {
    if (isProd) {
      return null;
    }
    console.warn("JWT_SECRET not set; using development CSRF fallback");
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
    const storedToken = session.token;
    const headerToken = request.headers.get("X-CSRF-Token");
    
    if (!isProd || isCI) {
        console.log(`[CSRF Debug] Stored: ${storedToken?.substring(0, 8)}..., Header: ${headerToken?.substring(0, 8)}..., Match: ${storedToken === headerToken}`);
        if (!storedToken) {
            console.log(`[CSRF Debug] Cookie Header: ${request.headers.get("Cookie")}`);
        }
    }

    if (!storedToken || !headerToken) return false;

    return storedToken === headerToken;
}
