import { promises as fs } from "fs";
import path from "path";
import { MonthMenus, DailyMenu } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function getFilePath(year: number, month: number): string {
  return path.join(DATA_DIR, `menus-${year}-${String(month).padStart(2, "0")}.json`);
}

export async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

export async function saveMenus(menus: MonthMenus): Promise<void> {
  await ensureDataDir();
  const filePath = getFilePath(menus.year, menus.month);
  await fs.writeFile(filePath, JSON.stringify(menus, null, 2), "utf-8");
}

export async function loadMenus(year: number, month: number): Promise<MonthMenus | null> {
  const filePath = getFilePath(year, month);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as MonthMenus;
  } catch {
    return null;
  }
}

export async function updateLunchMenus(
  year: number,
  month: number,
  lunch: DailyMenu[]
): Promise<MonthMenus> {
  const existing = await loadMenus(year, month);
  const menus: MonthMenus = existing || { year, month, lunch: [], dinner: [] };
  menus.lunch = lunch;
  await saveMenus(menus);
  return menus;
}

export async function updateDinnerMenus(
  year: number,
  month: number,
  dinner: DailyMenu[]
): Promise<MonthMenus> {
  const existing = await loadMenus(year, month);
  const menus: MonthMenus = existing || { year, month, lunch: [], dinner: [] };
  menus.dinner = dinner;
  await saveMenus(menus);
  return menus;
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
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const months: { year: number; month: number }[] = [];

  for (const file of files) {
    const match = file.match(/^menus-(\d{4})-(\d{2})\.json$/);
    if (match) {
      months.push({
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10),
      });
    }
  }

  return months.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}
