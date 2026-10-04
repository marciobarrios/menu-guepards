import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Browsers cap persistent cookies. Refresh on each visit; tokens have no expiry.
export const OWNER_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  // NextURL can normalize 127.0.0.1 to localhost. Preserve the browser's Host,
  // and do not trust a client-supplied X-Forwarded-Host for CSRF comparisons.
  const host = request.headers.get("host");
  if (host) url.host = host;
  return url.origin;
}

function cookieOptions(request: Request) {
  const url = new URL(requestOrigin(request));
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return {
    name: localHttp ? "menu-owner-local" : "__Host-menu-owner",
    httpOnly: true,
    secure: !localHttp,
    sameSite: "strict" as const,
    path: "/",
  };
}

function sign(nonce: string, request: Request, secret: string): string {
  // Bind the token to this app and origin; never store the owner secret in it.
  return createHmac("sha256", secret)
    .update(`menu-guepards:owner-session:v1\0${requestOrigin(request)}\0${nonce}`)
    .digest("base64url");
}

export function createOwnerSession(request: Request): string {
  const secret = process.env.OWNER_SECRET;
  if (!secret?.trim()) throw new Error("Owner access is not configured");
  const nonce = randomBytes(32).toString("base64url");
  return `v1.${nonce}.${sign(nonce, request, secret)}`;
}

export function getOwnerSession(request: Request): string | null {
  const secret = process.env.OWNER_SECRET;
  if (!secret?.trim()) return null;
  const prefix = `${cookieOptions(request).name}=`;
  const matches = (request.headers.get("cookie") || "").split(";")
    .map(cookie => cookie.trim()).filter(cookie => cookie.startsWith(prefix));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(prefix.length);
  const parts = /^v1\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!parts) return null;
  const expected = Buffer.from(sign(parts[1], request, secret));
  return timingSafeEqual(Buffer.from(parts[2]), expected) ? token : null;
}

export function setOwnerSession(response: NextResponse, request: Request, token: string) {
  response.cookies.set({ ...cookieOptions(request), value: token, maxAge: OWNER_COOKIE_MAX_AGE });
}

export function clearOwnerSession(response: NextResponse, request: Request) {
  response.cookies.set({ ...cookieOptions(request), value: "", maxAge: 0 });
}

export function requireSameOrigin(request: Request): NextResponse | null {
  const origin = requestOrigin(request);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== origin || (fetchSite !== null && fetchSite !== "same-origin")) {
    return NextResponse.json({ success: false, error: "Origen no autoritzat." },
      { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}
