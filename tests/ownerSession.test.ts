import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "@/app/api/owner-session/route";
import { createOwnerSession, getOwnerSession, OWNER_COOKIE_MAX_AGE } from "@/lib/ownerSession";
import { requireCronAuthorization, requireOwnerAuthorization } from "@/lib/auth";

const origin = "https://menus.example.test";
const bearer = "Bearer test-only-owner-secret";
function request(method = "GET", headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/owner-session`, { method, headers });
}
function rememberedRequest(method = "POST", extra: Record<string, string> = {}) {
  const token = createOwnerSession(request());
  return request(method, { cookie: `__Host-menu-owner=${token}`, origin, ...extra });
}

describe("remembering a device", () => {
  it("issues an opaque, secure host-only persistent cookie after owner authorization", async () => {
    const response = await POST(request("POST", { origin, authorization: bearer }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, remembered: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.cookies.get("__Host-menu-owner")!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: OWNER_COOKIE_MAX_AGE });
    expect(cookie.domain).toBeUndefined();
    expect(cookie.value).not.toContain("test-only-owner-secret");
    expect(getOwnerSession(request("GET", { cookie: `${cookie.name}=${cookie.value}` }))).toBe(cookie.value);
  });
  it.each([undefined, "", "   "])("cannot create sessions when configuration is %s", async secret => {
    vi.stubEnv("OWNER_SECRET", secret);
    const response = await POST(request("POST", { origin, authorization: bearer }));
    expect(response.status).toBe(503);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it.each(["", "Bearer wrong", "Bearer test-only-cron-secret"])("does not remember with %s", async authorization => {
    const response = await POST(request("POST", { origin, authorization }));
    expect(response.status).toBe(401);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it("requires explicit owner credentials to register, even with an existing cookie", async () => {
    expect((await POST(rememberedRequest())).status).toBe(401);
  });
  it("uses a separate nonsecure cookie only on HTTP loopback for local development", async () => {
    const req = new NextRequest("http://127.0.0.1:3000/api/owner-session", {
      method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", authorization: bearer },
    });
    const response = await POST(req);
    expect(response.cookies.get("menu-owner-local")).toMatchObject({ httpOnly: true, secure: false });
    expect(response.cookies.get("__Host-menu-owner")).toBeUndefined();
  });
});

describe("cookie authorization and lifetime", () => {
  it("authorizes a same-origin operation without resending the owner secret", () => {
    expect(requireOwnerAuthorization(rememberedRequest())).toBeNull();
  });
  it("never accepts an owner cookie as a cron credential", () => {
    expect(requireCronAuthorization(rememberedRequest())?.status).toBe(401);
  });
  it("does not allow a cookie to mask an explicitly wrong bearer", () => {
    expect(requireOwnerAuthorization(rememberedRequest("POST", { authorization: "Bearer wrong" }))?.status).toBe(401);
  });
  it("rejects tampered, duplicate, malformed and cross-origin tokens", () => {
    const token = createOwnerSession(request());
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const otherOriginToken = createOwnerSession(new Request("https://other.example.test/"));
    for (const cookie of [
      `__Host-menu-owner=${tampered}`, `__Host-menu-owner=invalid`,
      `__Host-menu-owner=${token}; __Host-menu-owner=${token}`, `__Host-menu-owner=${otherOriginToken}`,
      `menu-owner-local=${token}`,
    ]) {
      expect(requireOwnerAuthorization(request("POST", { cookie, origin }))?.status).toBe(401);
    }
  });
  it("has no server expiry, even after many years, and refreshes browser retention on visit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
    const req = rememberedRequest("GET");
    const initial = await GET(req);
    const initialCookie = initial.cookies.get("__Host-menu-owner")!;
    vi.setSystemTime(new Date("2056-10-05T00:00:00Z"));
    const later = await GET(req);
    expect(await later.json()).toEqual({ success: true, remembered: true });
    const refreshed = later.cookies.get("__Host-menu-owner")!;
    expect(refreshed.value).toBe(initialCookie.value);
    expect(refreshed.maxAge).toBe(OWNER_COOKIE_MAX_AGE);
    expect(new Date(refreshed.expires!).getTime()).toBeGreaterThan(new Date(initialCookie.expires!).getTime());
  });
  it("invalidates all existing sessions when OWNER_SECRET changes or disappears", async () => {
    const req = rememberedRequest();
    for (const secret of ["new-test-only-owner-secret", "", undefined]) {
      vi.stubEnv("OWNER_SECRET", secret);
      expect(getOwnerSession(req)).toBeNull();
      expect(requireOwnerAuthorization(req)?.status).toBe(secret ? 401 : 503);
      expect((await (await GET(req)).json()).remembered).toBe(false);
    }
  });
  it("reports anonymous status without setting a cookie", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ success: true, remembered: false });
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});

describe("CSRF and forgetting", () => {
  it("ignores a forged forwarded host for CSRF checks", () => {
    const req = rememberedRequest("POST", { origin: "https://evil.example.test", "x-forwarded-host": "evil.example.test" });
    expect(requireOwnerAuthorization(req)?.status).toBe(403);
  });
  it.each([undefined, "null", "https://evil.example.test", "http://menus.example.test"])("rejects cookie mutations with origin %s", originHeader => {
    const req = rememberedRequest();
    if (originHeader === undefined) req.headers.delete("origin");
    else req.headers.set("origin", originHeader);
    expect(requireOwnerAuthorization(req)?.status).toBe(403);
  });
  it.each([POST, DELETE])("blocks cross-origin session changes", async handler => {
    const response = await handler(request(handler === POST ? "POST" : "DELETE", {
      origin: "https://evil.example.test", authorization: bearer,
    }));
    expect(response.status).toBe(403);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it.each(["cross-site", "same-site"])("does not refresh on %s requests", async site => {
    const req = rememberedRequest("GET", { "sec-fetch-site": site });
    const response = await GET(req);
    expect(response.status).toBe(403);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(requireOwnerAuthorization(req)?.status).toBe(403);
  });
  it("forgets only this browser's cookie, even after secret rotation", async () => {
    const req = rememberedRequest("DELETE");
    vi.stubEnv("OWNER_SECRET", "rotated-test-secret");
    const response = await DELETE(req);
    expect(await response.json()).toEqual({ success: true, remembered: false });
    expect(response.cookies.get("__Host-menu-owner")).toMatchObject({ value: "", maxAge: 0, httpOnly: true, secure: true, sameSite: "strict", path: "/" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
