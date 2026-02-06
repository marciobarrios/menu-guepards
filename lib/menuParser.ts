import { DailyMenu, ParsedMenuResult } from "./types";

const LUNCH_DISHES_PER_DAY = 3;

function getWeekdaysInMonth(year: number, month: number, startDay: number = 1): number[] {
  const weekdays: number[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = startDay; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      weekdays.push(day);
    }
  }

  return weekdays;
}

function extractDishesWithDashes(text: string): string[] {
  // Truncate at "GASTRONOMIA" section (monthly special, not regular daily menu)
  const gastronomiaIndex = text.indexOf("GASTRONOMIA");
  const cleanText = gastronomiaIndex >= 0 ? text.substring(0, gastronomiaIndex) : text;

  // Split by dash markers at line start
  const parts = cleanText.split(/^-\s*/m);

  // Skip parts[0] (pre-first-dash header content)
  return parts.slice(1)
    .map((p) => {
      // First, take only the lines that are actual dish content
      // Stop at footer markers or email addresses
      const lines = p.split(/\n/);
      const dishLines: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        // Stop if we hit footer content
        if (trimmed.includes("@")) break;
        if (trimmed.includes("ESCOLA")) break;
        if (trimmed.includes("BASAL")) break;
        if (trimmed.includes("GASTRONOMIA")) break;
        if (/^\d{3}/.test(trimmed)) break;
        dishLines.push(trimmed);
      }

      // Clean up the dish text
      return dishLines
        .join(" ")
        .replace(/\(\d+(,\s*\d+)*\)/g, "") // Remove allergen numbers like (1, 2, 3)
        .replace(/\s{2,}/g, " ")
        .trim();
    })
    .filter((p) => {
      // Filter out empty strings and very short content
      if (!p) return false;
      if (p.length < 5) return false;
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
      if (l.includes("GASTRONOMIA")) return false;
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

function groupLunchDishesIntoDays(dishes: string[], expectedDays: number): string[][] {
  const days: string[][] = [];

  for (let i = 0; i < dishes.length; i += LUNCH_DISHES_PER_DAY) {
    const dayDishes = dishes.slice(i, i + LUNCH_DISHES_PER_DAY);
    if (dayDishes.length > 0) {
      days.push(dayDishes);
    }
  }

  if (days.length !== expectedDays) {
    console.warn(
      `Lunch grouping mismatch: ${days.length} groups from ${dishes.length} dishes, expected ${expectedDays} weekdays`
    );
  }

  return days;
}

function groupDinnerDishesIntoDays(
  dishes: string[],
  weekdays: number[],
  singleDishDays: number[]
): string[][] {
  // Dinner menus have 2 dishes per day, EXCEPT:
  // 1. When a dish contains "plat únic"
  // 2. When the day is in singleDishDays array
  const days: string[][] = [];
  let dishIndex = 0;
  let dayIndex = 0;

  while (dishIndex < dishes.length && dayIndex < weekdays.length) {
    const currentDay = weekdays[dayIndex];
    const dish = dishes[dishIndex];

    // Check if this is a single-dish day (either marked "plat únic" or in singleDishDays)
    const isMarkedPlatUnic = dish.toLowerCase().includes("plat únic");
    const isInSingleDishDays = singleDishDays.includes(currentDay);

    if (isMarkedPlatUnic || isInSingleDishDays) {
      // Single dish day
      days.push([dish]);
      dishIndex += 1;
    } else {
      // Normal 2-dish day
      const dayDishes = dishes.slice(dishIndex, dishIndex + 2);
      if (dayDishes.length > 0) {
        days.push(dayDishes);
      }
      dishIndex += 2;
    }
    dayIndex += 1;
  }

  return days;
}

export async function parsePdfBuffer(
  buffer: Buffer,
  year: number,
  month: number,
  startDay: number = 1,
  singleDishDays: number[] = []
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

    // Get weekdays in the month starting from startDay
    const weekdays = getWeekdaysInMonth(year, month, startDay);

    // Group dishes into days based on type
    const daysOfDishes = hasDashes
      ? groupLunchDishesIntoDays(dishes, weekdays.length)
      : groupDinnerDishesIntoDays(dishes, weekdays, singleDishDays);

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
