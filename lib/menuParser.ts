import { DailyMenu, ParsedMenuResult } from "./types";

const LUNCH_DISHES_PER_DAY = 3;
const DINNER_DISHES_PER_DAY = 2;

function getWeekdaysInMonth(year: number, month: number): number[] {
  const weekdays: number[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      weekdays.push(day);
    }
  }

  return weekdays;
}

function extractDishesWithDashes(text: string): string[] {
  // Split by dash markers at line start
  const parts = text.split(/^-\s*/m);

  return parts
    .map((p) => {
      // Clean up the dish text
      return p
        .replace(/\(\d+(,\s*\d+)*\)/g, "") // Remove allergen numbers like (1, 2, 3)
        .replace(/\n/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    })
    .filter((p) => {
      // Filter out empty strings and non-dish content
      if (!p) return false;
      if (p.length < 5) return false;
      if (p.includes("@")) return false;
      if (p.includes("ESCOLA")) return false;
      if (p.includes("BASAL")) return false;
      if (/^\d{3}/.test(p)) return false;
      return true;
    });
}

function extractDishesFromLines(text: string): string[] {
  // For dinner menus without dashes, we need to be smarter about line joining
  // Each dish typically starts with a capital letter and ends when the next dish starts
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (l.includes("@")) return false;
      if (l.includes("ESCOLA")) return false;
      if (l.includes("BASAL")) return false;
      if (l.includes("SOPARS")) return false;
      if (/^\d{3}/.test(l)) return false;
      return true;
    });

  const dishes: string[] = [];
  let currentDish = "";

  for (const line of lines) {
    // Check if this line starts a new dish (starts with capital letter after a previous dish)
    const startsWithCapital = /^[A-ZÀÈÉÍÒÓÚÇ]/.test(line);

    if (currentDish && startsWithCapital) {
      // Save the previous dish and start a new one
      dishes.push(currentDish.trim());
      currentDish = line;
    } else if (currentDish) {
      // Continue the current dish
      currentDish += " " + line;
    } else {
      // Start the first dish
      currentDish = line;
    }
  }

  // Don't forget the last dish
  if (currentDish) {
    dishes.push(currentDish.trim());
  }

  return dishes.filter((d) => d.length >= 5);
}

function groupDishesIntoDays(dishes: string[], dishesPerDay: number): string[][] {
  const days: string[][] = [];

  for (let i = 0; i < dishes.length; i += dishesPerDay) {
    const dayDishes = dishes.slice(i, i + dishesPerDay);
    if (dayDishes.length > 0) {
      days.push(dayDishes);
    }
  }

  return days;
}

export async function parsePdfBuffer(
  buffer: Buffer,
  year: number,
  month: number
): Promise<ParsedMenuResult> {
  try {
    // Dynamic import of pdf-parse
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);

    // Check if text has dash-prefixed format (lunch menus)
    const hasDashes = data.text.includes("\n-") || data.text.startsWith("-");

    // Extract dishes based on format
    const dishes = hasDashes
      ? extractDishesWithDashes(data.text)
      : extractDishesFromLines(data.text);

    if (dishes.length === 0) {
      return {
        success: false,
        error: "No s'han trobat plats al PDF",
      };
    }

    // Determine dishes per day based on format
    const dishesPerDay = hasDashes ? LUNCH_DISHES_PER_DAY : DINNER_DISHES_PER_DAY;

    // Group dishes into days
    const daysOfDishes = groupDishesIntoDays(dishes, dishesPerDay);

    // Get weekdays in the month
    const weekdays = getWeekdaysInMonth(year, month);

    if (daysOfDishes.length > weekdays.length) {
      console.warn(
        `Warning: More menu days (${daysOfDishes.length}) than weekdays (${weekdays.length}) in month`
      );
    }

    // Map to calendar dates
    const menus: DailyMenu[] = daysOfDishes.map((dayDishes, index) => ({
      day: index < weekdays.length ? weekdays[index] : index + 1,
      dishes: dayDishes,
    }));

    return {
      success: true,
      menus,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error parsing PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
