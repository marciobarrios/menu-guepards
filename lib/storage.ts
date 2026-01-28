import { MonthMenus, DailyMenu } from "./types";
import { getFileFromGitHub, saveFileToGitHub } from "./github";

const CATALAN_MONTHS = [
  "gener", "febrer", "març", "abril", "maig", "juny",
  "juliol", "agost", "setembre", "octubre", "novembre", "desembre",
];

function getFilePath(year: number, month: number): string {
  return `data/menus-${year}-${String(month).padStart(2, "0")}.json`;
}

export async function saveMenus(menus: MonthMenus): Promise<boolean> {
  const filePath = getFilePath(menus.year, menus.month);
  const monthName = CATALAN_MONTHS[menus.month - 1];
  const message = `Update menus for ${monthName} ${menus.year}`;

  return saveFileToGitHub(filePath, JSON.stringify(menus, null, 2), message);
}

export async function loadMenus(year: number, month: number): Promise<MonthMenus | null> {
  const filePath = getFilePath(year, month);
  const file = await getFileFromGitHub(filePath);

  if (!file) {
    return null;
  }

  try {
    return JSON.parse(file.content) as MonthMenus;
  } catch {
    return null;
  }
}

export async function updateLunchMenus(
  year: number,
  month: number,
  lunch: DailyMenu[]
): Promise<{ success: boolean; menus?: MonthMenus }> {
  const existing = await loadMenus(year, month);
  const menus: MonthMenus = existing || { year, month, lunch: [], dinner: [] };
  menus.lunch = lunch;

  const success = await saveMenus(menus);
  return { success, menus: success ? menus : undefined };
}

export async function updateDinnerMenus(
  year: number,
  month: number,
  dinner: DailyMenu[]
): Promise<{ success: boolean; menus?: MonthMenus }> {
  const existing = await loadMenus(year, month);
  const menus: MonthMenus = existing || { year, month, lunch: [], dinner: [] };
  menus.dinner = dinner;

  const success = await saveMenus(menus);
  return { success, menus: success ? menus : undefined };
}

export async function getTodayMenus(): Promise<{
  lunch: DailyMenu | null;
  dinner: DailyMenu | null;
  month: number;
  year: number;
  day: number;
}> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  const menus = await loadMenus(year, month);

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
