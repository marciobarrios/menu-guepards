import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as parse } from "@/app/api/parse-menu/route";
import { POST as send, GET as cronSend } from "@/app/api/send-menu/route";
import { GET as cronFetch } from "@/app/api/auto-fetch-menu/route";
import { getTodayMenus, loadMenus, updateLunchMenus, updateDinnerMenus, updateMenus } from "@/lib/storage";
import { parsePdfBuffer } from "@/lib/menuParser";
import { fetchPdfFromUrl } from "@/lib/pdfFetcher";
import { sendTelegramMessage } from "@/lib/telegram";

vi.mock("@/lib/storage", () => ({
  getTodayMenus: vi.fn(), loadMenus: vi.fn(), updateLunchMenus: vi.fn(), updateDinnerMenus: vi.fn(), updateMenus: vi.fn(),
}));
vi.mock("@/lib/menuParser", () => ({ parsePdfBuffer: vi.fn() }));
vi.mock("@/lib/pdfFetcher", () => ({ fetchPdfFromUrl: vi.fn() }));
vi.mock("@/lib/telegram", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/telegram")>(), sendTelegramMessage: vi.fn(),
}));

function request(auth?: string) {
  // Deliberately invalid upload: authorization must run before any body parsing.
  return new NextRequest("http://localhost/api/manual", {
    method: "POST", body: "unread body", headers: auth ? { authorization: auth } : {},
  });
}

function expectNoWork() {
  for (const fn of [getTodayMenus, loadMenus, updateLunchMenus, updateDinnerMenus, updateMenus, parsePdfBuffer, fetchPdfFromUrl, sendTelegramMessage, fetch]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

describe.each([["parse/preview/save", parse], ["manual send", send]] as const)("%s owner authorization", (_, handler) => {
  it.each([undefined, "", "   "])("fails closed when OWNER_SECRET is %s, even with a cron credential", async secret => {
    vi.stubEnv("OWNER_SECRET", secret);
    const req = request("Bearer test-only-cron-secret");
    const response = await handler(req);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(req.bodyUsed).toBe(false);
    expectNoWork();
  });
  it.each([undefined, "Bearer wrong", "Bearer test-only-ownex-secret", "Bearer test-only-cron-secret", "test-only-owner-secret", "Bearer undefined"])("rejects %s before reading uploads or doing work", async auth => {
    const req = request(auth);
    const response = await handler(req);
    expect(response.status).toBe(401);
    expect((await response.json()).success).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(req.bodyUsed).toBe(false);
    expectNoWork();
  });
  it("does not accept a query-string secret", async () => {
    const req = new NextRequest("http://localhost/api/manual?OWNER_SECRET=test-only-owner-secret", { method: "POST" });
    expect((await handler(req)).status).toBe(401);
    expectNoWork();
  });
});

it("allows an owner send without requiring the cron secret", async () => {
  vi.stubEnv("CRON_SECRET", undefined);
  vi.mocked(getTodayMenus).mockResolvedValue({
    lunch: { day: 5, dishes: ["Owner's test meal"] }, dinner: null, day: 5, month: 10, year: 2026,
  });
  vi.mocked(sendTelegramMessage).mockResolvedValue({ success: true });
  const response = await send(request("Bearer test-only-owner-secret"));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.success).toBe(true);
  expect(JSON.stringify(result)).not.toContain("test-only-owner-secret");
  expect(sendTelegramMessage).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Owner's test meal"), { includeWhatsAppShare: true });
});

it.each([["send", cronSend], ["auto-fetch", cronFetch]] as const)("does not accept an owner credential on the %s cron route", async (_, handler) => {
  const req = new NextRequest("http://localhost/api/cron", { headers: { authorization: "Bearer test-only-owner-secret" } });
  expect((await handler(req)).status).toBe(401);
  expectNoWork();
});
