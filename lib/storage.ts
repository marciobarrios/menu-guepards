import { MonthMenus, DailyMenu } from "./types";
import { getFileFromGitHub, saveFileToGitHub } from "./github";
import { revalidateTag } from "next/cache";
import { isMenuDate, menuCacheSeconds, menuCacheTag } from "./menuDate";

const CATALAN_MONTHS = [
  "gener", "febrer", "març", "abril", "maig", "juny",
  "juliol", "agost", "setembre", "octubre", "novembre", "desembre",
];

function getFilePath(year: number, month: number): string {
  if (!isMenuDate(year, month)) throw new Error("Invalid year or month");
  return `data/menus-${year}-${String(month).padStart(2, "0")}.json`;
}

export async function saveMenus(menus: MonthMenus, expectedSha?: string | null): Promise<boolean> {
  const filePath = getFilePath(menus.year, menus.month);
  const monthName = CATALAN_MONTHS[menus.month - 1];
  const message = `Update menus for ${monthName} ${menus.year}`;

  const success = await saveFileToGitHub(filePath, JSON.stringify(menus, null, 2), message, expectedSha);
  if (success) revalidateTag(menuCacheTag(menus.year, menus.month));
  return success;
}

export async function loadMenus(year: number, month: number, options: { fresh?: boolean } = {}): Promise<MonthMenus | null> {
  const filePath = getFilePath(year, month);
  const file = await getFileFromGitHub(filePath, options.fresh ? undefined : {
    revalidate: menuCacheSeconds(year, month),
    tags: [menuCacheTag(year, month)],
  });

  if (!file) {
    return null;
  }

  try {
    return JSON.parse(file.content) as MonthMenus;
  } catch {
    return null;
  }
}

export async function updateMenus(
  year: number,
  month: number,
  updates: Partial<Pick<MonthMenus, "lunch" | "dinner">>
): Promise<{ success: boolean; menus?: MonthMenus }> {
  const file = await getFileFromGitHub(getFilePath(year, month));
  // Do not replace an unreadable file with a partial menu.
  let existing: MonthMenus | null;
  try {
    existing = file ? JSON.parse(file.content) : null;
  } catch {
    return { success: false };
  }
  const menus: MonthMenus = existing || { year, month, lunch: [], dinner: [] };
  Object.assign(menus, updates);

  const success = await saveMenus(menus, file?.sha ?? null);
  return { success, menus: success ? menus : undefined };
}

export async function updateLunchMenus(year: number, month: number, lunch: DailyMenu[]) {
  return updateMenus(year, month, { lunch });
}

export async function updateDinnerMenus(
  year: number,
  month: number,
  dinner: DailyMenu[]
): Promise<{ success: boolean; menus?: MonthMenus }> {
  return updateMenus(year, month, { dinner });
}

export async function getTodayMenus(): Promise<{
  lunch: DailyMenu | null;
  dinner: DailyMenu | null;
  month: number;
  year: number;
  day: number;
}> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();

  const menus = await loadMenus(year, month, { fresh: true });

  return {
    lunch: menus?.lunch.find((m) => m.day === day) || null,
    dinner: menus?.dinner.find((m) => m.day === day) || null,
    month,
    year,
    day,
  };
}

export async function listAvailableMonths(): Promise<{ year: number; month: number }[]> {
  // For now, return current and surrounding months
  // A full implementation would list files from GitHub, but that's more complex
  const now = new Date();
  const months: { year: number; month: number }[] = [];

  for (let offset = -2; offset <= 2; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    });
  }

  return months;
}
