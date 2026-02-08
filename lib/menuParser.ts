import { DailyMenu, ParsedMenuResult } from "./types";

interface TextItem {
  str: string;
  x: number;
  y: number;
}

// Non-dish content markers
const SKIP_MARKERS = ["@", "ESCOLA", "MARTORELL", "BASAL", "SOPARS", "GASTRONOMIA", "FESTIU"];

/**
 * Find the first Monday of the month at or after startDay.
 */
function getFirstMonday(year: number, month: number, startDay: number): number {
  for (let d = startDay; d <= startDay + 7; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 1) return d;
  }
  return startDay;
}

/**
 * Cluster sorted numeric values into groups separated by gaps > threshold.
 */
function clusterValues(values: number[], gapThreshold: number): number[][] {
  if (values.length === 0) return [];
  const sorted = Array.from(new Set(values)).sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > gapThreshold) {
      clusters.push([sorted[i]]);
    } else {
      clusters[clusters.length - 1].push(sorted[i]);
    }
  }
  return clusters;
}

/**
 * Assign a value to a column using left-edge boundaries.
 * colLeftEdges must be sorted ascending.
 */
function assignToColumn(x: number, colLeftEdges: number[]): number {
  for (let i = colLeftEdges.length - 1; i >= 0; i--) {
    if (x >= colLeftEdges[i]) return i;
  }
  return 0;
}

/**
 * Assign a value to a row using boundary midpoints.
 * rowBoundaries[i] is the lower Y threshold for row i (PDF: higher Y = top).
 * Must be sorted descending (highest threshold first).
 */
function assignToRow(y: number, rowBoundaries: number[]): number {
  for (let i = 0; i < rowBoundaries.length; i++) {
    if (y >= rowBoundaries[i]) return i;
  }
  return rowBoundaries.length; // Last row (below all boundaries)
}

/**
 * Extract text items with (x, y) positions from a PDF buffer.
 */
async function extractTextItems(buffer: Buffer): Promise<{ items: TextItem[]; rawText: string }> {
  const pdfParse = (await import("pdf-parse")).default;
  const items: TextItem[] = [];
  let rawText = "";

  function customRender(pageData: any) {
    return pageData.getTextContent().then((textContent: any) => {
      let lastY: number | undefined;
      let text = "";
      for (const item of textContent.items) {
        if (item.str && item.str.trim()) {
          items.push({
            str: item.str,
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5]),
          });
        }
        // Reproduce default text concatenation for format detection
        if (lastY === item.transform[5] || lastY === undefined) {
          text += item.str;
        } else {
          text += "\n" + item.str;
        }
        lastY = item.transform[5];
      }
      rawText = text;
      return text;
    });
  }

  await (pdfParse as any)(buffer, { pagerender: customRender });
  return { items, rawText };
}

/**
 * Clean a dish string: remove allergen numbers, extra whitespace.
 */
function cleanDish(text: string): string {
  return text
    .replace(/\(\d+(,\s*\d+)*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Convert a cell's text items into lines (joining items at the same Y).
 */
function itemsToLines(cellItems: TextItem[]): string[] {
  const sorted = [...cellItems].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let currentY: number | null = null;
  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) > 3) {
      lines.push(item.str);
      currentY = item.y;
    } else {
      lines[lines.length - 1] += item.str;
    }
  }
  return lines;
}

/**
 * Extract dishes from a cell's text items using dash markers (lunch format).
 */
function extractLunchDishesFromCell(cellItems: TextItem[]): string[] {
  const text = itemsToLines(cellItems).join("\n");
  const parts = text.split(/^-\s*/m).slice(1); // Skip pre-first-dash content
  return parts
    .map((p) => cleanDish(p.replace(/\n/g, " ")))
    .filter((p) => p.length >= 5);
}

/**
 * Extract dishes from a cell's text items using capital-letter detection (dinner format).
 */
function extractDinnerDishesFromCell(cellItems: TextItem[]): string[] {
  const lines = itemsToLines(cellItems);
  const dishes: string[] = [];
  let currentDish = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const startsWithCapital = /^[A-ZÀÈÉÍÒÓÚÇ]/.test(trimmed);

    if (currentDish && startsWithCapital) {
      dishes.push(cleanDish(currentDish));
      currentDish = trimmed;
    } else if (currentDish) {
      currentDish += " " + trimmed;
    } else {
      currentDish = trimmed;
    }
  }
  if (currentDish) {
    dishes.push(cleanDish(currentDish));
  }

  return dishes.filter((d) => d.length >= 5);
}

/**
 * Filter items to only those that are anchor points for grid detection.
 * For lunch: dash-prefixed items. For dinner: capital-letter items.
 * These reliably sit at the left edge of their grid cell.
 */
function getAnchorItems(items: TextItem[], isLunch: boolean): TextItem[] {
  return items.filter((item) => {
    const s = item.str.trimStart();
    // Skip non-content
    if (SKIP_MARKERS.some((m) => s.includes(m))) return false;
    if (/^\d{3}\s/.test(s)) return false;
    // Anchor detection
    if (isLunch) return s.startsWith("-");
    return /^[A-ZÀÈÉÍÒÓÚÇ]/.test(s);
  });
}

/**
 * Parse a PDF menu using position-based grid extraction.
 */
function parseGrid(
  items: TextItem[],
  year: number,
  month: number,
  isLunch: boolean
): DailyMenu[] {
  // Use anchor items (dish starts) for reliable column/row detection
  const anchorItems = getAnchorItems(items, isLunch);
  if (anchorItems.length === 0) return [];

  // Detect 5 weekday columns from anchor X positions
  const xClusters = clusterValues(anchorItems.map((i) => i.x), 60);
  if (xClusters.length < 5) {
    console.warn(`Expected ≥5 column clusters, found ${xClusters.length}`);
    return [];
  }
  // Take the 5 rightmost clusters (skip any sidebar noise)
  const colClusters = xClusters.slice(-5);
  // Column left edges: items with x >= colLeftEdges[i] belong to column i
  const colLeftEdges = colClusters.map((c) => Math.min(...c));

  // Detect week rows from anchor Y positions
  const yClusters = clusterValues(anchorItems.map((i) => i.y), 40);
  // Reverse for top-to-bottom order (PDF Y axis: higher Y = top)
  const rowClusters = [...yClusters].reverse();
  // Row boundaries: midpoint between bottom of row[i] and top of row[i+1]
  // Items with Y >= boundary[i] go to row i (checked in order)
  const rowBoundaries: number[] = [];
  for (let i = 0; i < rowClusters.length - 1; i++) {
    const thisMin = Math.min(...rowClusters[i]);
    const nextMax = Math.max(...rowClusters[i + 1]);
    rowBoundaries.push(Math.round((thisMin + nextMax) / 2));
  }

  // Filter all items to exclude non-content, then assign to grid cells
  const contentItems = items.filter((item) => {
    const s = item.str.trim();
    return !SKIP_MARKERS.some((m) => s.includes(m)) && !/^\d{3}\s/.test(s);
  });

  const grid: Map<string, TextItem[]> = new Map();
  for (const item of contentItems) {
    const col = assignToColumn(item.x, colLeftEdges);
    const row = assignToRow(item.y, rowBoundaries);
    const key = `${row},${col}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(item);
  }

  // Map grid positions to calendar days
  const firstMonday = getFirstMonday(year, month, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const menus: DailyMenu[] = [];

  for (const [key, cellItems] of Array.from(grid.entries())) {
    const [row, col] = key.split(",").map(Number);
    const day = firstMonday + row * 7 + col;

    if (day < 1 || day > daysInMonth) continue;

    // Skip holiday cells
    const cellText = cellItems.map((i) => i.str).join(" ");
    if (/FESTIU/i.test(cellText)) continue;

    const dishes = isLunch
      ? extractLunchDishesFromCell(cellItems)
      : extractDinnerDishesFromCell(cellItems);

    if (dishes.length > 0) {
      menus.push({ day, dishes });
    }
  }

  menus.sort((a, b) => a.day - b.day);
  return menus;
}

export async function parsePdfBuffer(
  buffer: Buffer,
  year: number,
  month: number,
  startDay: number = 1,
  singleDishDays: number[] = []
): Promise<ParsedMenuResult> {
  try {
    const { items, rawText } = await extractTextItems(buffer);

    // Detect format: dash-prefixed = lunch, otherwise = dinner
    const isLunch = rawText.includes("\n-") || rawText.startsWith("-");

    const menus = parseGrid(items, year, month, isLunch);

    if (menus.length === 0) {
      return {
        success: false,
        error: "No s'han trobat plats al PDF",
      };
    }

    return { success: true, menus };
  } catch (error) {
    return {
      success: false,
      error: `Error parsing PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
