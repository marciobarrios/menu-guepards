import { describe, expect, it } from "vitest";
import { isMenuDate, parseMenuDate, menuCacheSeconds } from "@/lib/menuDate";

describe("canonical menu dates", () => {
  it.each(["0", "13", "01", "1tail", "1.5", "1e1", " 1", "+1", "", "../1"])("rejects month %s", month => {
    expect(parseMenuDate("2026", month)).toBeNull();
  });
  it.each(["1999", "2100", "02026", "2026tail", "2026.0", "2026 ", "", null])( "rejects year %s", year => {
    expect(parseMenuDate(year, "10")).toBeNull();
  });
  it("accepts supported dates and rejects invalid numeric storage arguments", () => {
    expect(parseMenuDate("2000", "1")).toEqual({ year: 2000, month: 1 });
    expect(parseMenuDate("2099", "12")).toEqual({ year: 2099, month: 12 });
    expect(isMenuDate(2026, NaN)).toBe(false);
    expect(isMenuDate(2026.5, 1)).toBe(false);
  });
  it("uses a short TTL for current/future months and one hour for history, in UTC", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(menuCacheSeconds(2025, 12, now)).toBe(3600);
    expect(menuCacheSeconds(2026, 1, now)).toBe(60);
    expect(menuCacheSeconds(2026, 2, now)).toBe(60);
  });
});
