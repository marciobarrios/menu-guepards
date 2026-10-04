export function isMenuDate(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2099 &&
    Number.isInteger(month) && month >= 1 && month <= 12;
}

// One canonical spelling keeps invalid/ambiguous dates out of paths and caches.
export function parseMenuDate(year: unknown, month: unknown) {
  if (typeof year !== "string" || !/^20\d{2}$/.test(year) ||
      typeof month !== "string" || !/^(?:[1-9]|1[0-2])$/.test(month)) {
    return null;
  }
  return { year: Number(year), month: Number(month) };
}

export function menuCacheTag(year: number, month: number): string {
  return `menus-${year}-${String(month).padStart(2, "0")}`;
}

export function menuCacheSeconds(year: number, month: number, now = new Date()): number {
  const historical = year < now.getUTCFullYear() ||
    (year === now.getUTCFullYear() && month < now.getUTCMonth() + 1);
  return historical ? 3600 : 60;
}
