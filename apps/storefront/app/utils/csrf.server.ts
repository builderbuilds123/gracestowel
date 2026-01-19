import { createCookie } from "react-router";

export const getCSRFCookie = (secret?: string) => createCookie("csrf_token", {
  path: "/",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" || import.meta.env.PROD,
  sameSite: "lax",
  secrets: [secret || "default-secret"], // Fallback for dev, but should be provided
  maxAge: 60 * 60 * 24, // 1 day
});

export async function createCSRFToken(request: Request, secret?: string) {
    const cookie = getCSRFCookie(secret);
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
    const cookie = getCSRFCookie(secret);
    const cookieHeader = request.headers.get("Cookie");
    const session = (await cookie.parse(cookieHeader)) || {};
    const storedToken = session.token;
    
    const headerToken = request.headers.get("X-CSRF-Token");
    
    if (!storedToken || !headerToken) return false;

    return storedToken === headerToken;
}
