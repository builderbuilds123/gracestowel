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

export const getCSRFCookie = (secret: string) => createCookie("csrf_token", {
  path: "/",
  httpOnly: true,
  secure: (process.env.NODE_ENV === "production" || import.meta.env.PROD) && !process.env.CI,
  sameSite: "lax",
  secrets: [secret],
  maxAge: 60 * 60 * 24, // 1 day
});

export async function createCSRFToken(request: Request, secret?: string) {
    const resolvedSecret = resolveCSRFSecret(secret);
    if (!resolvedSecret) {
        throw new Error("JWT_SECRET not configured for CSRF");
    }
    const cookie = getCSRFCookie(resolvedSecret);
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

export async function validateCSRFToken(request: Request, secret?: string) {
    const resolvedSecret = resolveCSRFSecret(secret);
    if (!resolvedSecret) {
        throw new Error("JWT_SECRET not configured for CSRF");
    }
    const cookie = getCSRFCookie(resolvedSecret);
    const cookieHeader = request.headers.get("Cookie");
    const session = (await cookie.parse(cookieHeader)) || {};
    const storedToken = session.token;
    
    const headerToken = request.headers.get("X-CSRF-Token");
    
    if (!storedToken || !headerToken) return false;

    return storedToken === headerToken;
}
