import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as send } from "@/app/api/send-menu/route";
import { GET as autoFetch } from "@/app/api/auto-fetch-menu/route";
import { getTodayMenus, loadMenus, updateMenus } from "@/lib/storage";
import { fetchPdfFromUrl } from "@/lib/pdfFetcher";
import { parsePdfBuffer } from "@/lib/menuParser";
import { sendTelegramMessage } from "@/lib/telegram";

vi.mock("@/lib/storage", () => ({ getTodayMenus: vi.fn(), loadMenus: vi.fn(), updateMenus: vi.fn() }));
vi.mock("@/lib/pdfFetcher", () => ({ fetchPdfFromUrl: vi.fn() }));
vi.mock("@/lib/menuParser", () => ({ parsePdfBuffer: vi.fn() }));
vi.mock("@/lib/telegram", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/telegram")>(), sendTelegramMessage: vi.fn(),
}));

const meal = [{ day: 5, dishes: ["Test meal"] }];
function request(auth = "Bearer test-only-cron-secret") {
  return new NextRequest("http://localhost/api/cron", { headers: { authorization: auth } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T09:00:00Z"));
  vi.mocked(loadMenus).mockResolvedValue(null);
  vi.mocked(fetchPdfFromUrl).mockResolvedValue(Buffer.from("mock PDF"));
  vi.mocked(parsePdfBuffer).mockResolvedValue({ success: true, menus: meal });
  vi.mocked(updateMenus).mockResolvedValue({ success: true });
  vi.mocked(sendTelegramMessage).mockResolvedValue({ success: true });
});

describe.each([["send", send], ["auto fetch", autoFetch]] as const)("%s cron authorization", (_, handler) => {
  it.each([undefined, "", "   "])("fails closed with secret %s", async secret => {
    vi.stubEnv("CRON_SECRET", secret);
    expect((await handler(request())).status).toBe(503);
    expect(loadMenus).not.toHaveBeenCalled();
    expect(getTodayMenus).not.toHaveBeenCalled();
    expect(fetchPdfFromUrl).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
  it.each(["", "Bearer wrong", "Bearer undefined", "test-only-cron-secret"])("rejects authorization %s before work", async auth => {
    expect((await handler(request(auth))).status).toBe(401);
    expect(loadMenus).not.toHaveBeenCalled();
    expect(getTodayMenus).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});

describe("authorized cron behavior", () => {
  it("sends the expected weekday message", async () => {
    vi.mocked(getTodayMenus).mockResolvedValue({ lunch: meal[0], dinner: null, day: 5, month: 10, year: 2026 });
    expect((await (await send(request())).json()).success).toBe(true);
    expect(sendTelegramMessage).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Test meal"), { includeWhatsAppShare: true });
  });
  it("skips existing menus using fresh data", async () => {
    vi.mocked(loadMenus).mockResolvedValue({ year: 2026, month: 10, lunch: meal, dinner: meal });
    expect((await (await autoFetch(request())).json()).skipped).toBe(true);
    expect(loadMenus).toHaveBeenCalledWith(2026, 10, { fresh: true });
    expect(fetchPdfFromUrl).not.toHaveBeenCalled();
    expect(updateMenus).not.toHaveBeenCalled();
  });
  it("saves both newly parsed meals in one update", async () => {
    const result = await (await autoFetch(request())).json();
    expect(result.success).toBe(true);
    expect(updateMenus).toHaveBeenCalledExactlyOnceWith(2026, 10, { lunch: meal, dinner: meal });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
  it("saves a valid meal when the other PDF is stale and reports partial failure", async () => {
    vi.mocked(parsePdfBuffer).mockResolvedValueOnce({ success: true, menus: meal }).mockResolvedValueOnce({ success: false, error: "Wrong month" });
    const result = await (await autoFetch(request())).json();
    expect(result.success).toBe(false);
    expect(result.results.lunch.saved).toBe(true);
    expect(result.results.dinner.saved).toBe(false);
    expect(updateMenus).toHaveBeenCalledExactlyOnceWith(2026, 10, { lunch: meal });
    expect(sendTelegramMessage).toHaveBeenCalledOnce();
  });
  it("preserves an already present meal", async () => {
    vi.mocked(loadMenus).mockResolvedValue({ year: 2026, month: 10, lunch: meal, dinner: [] });
    expect((await (await autoFetch(request())).json()).success).toBe(true);
    expect(fetchPdfFromUrl).toHaveBeenCalledOnce();
    expect(updateMenus).toHaveBeenCalledExactlyOnceWith(2026, 10, { dinner: meal });
  });
  it("reports one failed save for both meals without marking either saved", async () => {
    vi.mocked(updateMenus).mockResolvedValue({ success: false });
    const result = await (await autoFetch(request())).json();
    expect(result.results.lunch.saved).toBe(false);
    expect(result.results.dinner.saved).toBe(false);
    expect(updateMenus).toHaveBeenCalledOnce();
    expect(sendTelegramMessage).toHaveBeenCalledOnce();
  });
  it("does no fetch or write after day ten", async () => {
    vi.setSystemTime(new Date("2026-10-11T09:00:00Z"));
    expect((await (await autoFetch(request())).json()).skipped).toBe(true);
    expect(loadMenus).not.toHaveBeenCalled();
    expect(updateMenus).not.toHaveBeenCalled();
  });
});
