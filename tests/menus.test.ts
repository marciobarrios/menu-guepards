import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/menus/route";
import { loadMenus, listAvailableMonths } from "@/lib/storage";

vi.mock("@/lib/storage", () => ({ loadMenus: vi.fn(), listAvailableMonths: vi.fn() }));

it.each(["year=2026", "month=10", "year=&month=10", "year=2026&month=01", "year=2026x&month=10", "year=2026&month=10&month=11", "year=2026&year=2027&month=10"])("rejects invalid query %s before reading GitHub", async query => {
  const response = await GET(new NextRequest(`http://localhost/api/menus?${query}`));
  expect(response.status).toBe(400);
  expect(loadMenus).not.toHaveBeenCalled();
  expect(listAvailableMonths).not.toHaveBeenCalled();
});

it("keeps dated reads public and prevents a second HTTP cache from masking invalidation", async () => {
  const menus = { year: 2026, month: 10, lunch: [], dinner: [] };
  vi.mocked(loadMenus).mockResolvedValue(menus);
  const response = await GET(new NextRequest("http://localhost/api/menus?year=2026&month=10"));
  expect(await response.json()).toEqual({ success: true, menus });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(loadMenus).toHaveBeenCalledExactlyOnceWith(2026, 10);
});

it("still lists available months without date parameters", async () => {
  vi.mocked(listAvailableMonths).mockResolvedValue([{ year: 2026, month: 10 }]);
  const response = await GET(new NextRequest("http://localhost/api/menus"));
  expect((await response.json()).months).toEqual([{ year: 2026, month: 10 }]);
  expect(loadMenus).not.toHaveBeenCalled();
});
