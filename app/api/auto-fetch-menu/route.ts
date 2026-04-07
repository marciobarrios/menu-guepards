import { NextRequest, NextResponse } from "next/server";
import { fetchPdfFromUrl } from "@/lib/pdfFetcher";
import { parsePdfBuffer } from "@/lib/menuParser";
import { loadMenus, updateLunchMenus, updateDinnerMenus } from "@/lib/storage";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const LUNCH_PDF_URL = process.env.LUNCH_PDF_URL || "https://www.ambitescola.cat/_menus/ArturMartorell-Basal.pdf";
const DINNER_PDF_URL = process.env.DINNER_PDF_URL || "https://www.ambitescola.cat/_menus/ArturMartorell-Sopars.pdf";

export async function GET(request: NextRequest) {
  // Verify cron secret for Vercel cron jobs
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const day = now.getUTCDate();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  // Only run during days 1-10 of the month (school may upload PDFs late)
  if (day > 10) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "Past day 10 of month",
      day,
    });
  }

  // Check if menus already exist for this month
  const existingMenus = await loadMenus(year, month);
  const hasLunch = existingMenus?.lunch && existingMenus.lunch.length > 0;
  const hasDinner = existingMenus?.dinner && existingMenus.dinner.length > 0;

  if (hasLunch && hasDinner) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "Menus already exist for this month",
      year,
      month,
    });
  }

  const results = {
    lunch: { fetched: false, parsed: false, saved: false, error: null as string | null },
    dinner: { fetched: false, parsed: false, saved: false, error: null as string | null },
  };

  // Fetch and process lunch menu if not already present
  if (!hasLunch) {
    console.log(`Fetching lunch PDF from ${LUNCH_PDF_URL}`);
    const lunchBuffer = await fetchPdfFromUrl(LUNCH_PDF_URL);

    if (lunchBuffer) {
      results.lunch.fetched = true;
      const parseResult = await parsePdfBuffer(lunchBuffer, year, month, 1, []);

      if (parseResult.success && parseResult.menus) {
        results.lunch.parsed = true;
        const saveResult = await updateLunchMenus(year, month, parseResult.menus);
        results.lunch.saved = saveResult.success;
        if (!saveResult.success) {
          results.lunch.error = "Failed to save to GitHub";
        }
      } else {
        results.lunch.error = parseResult.error || "Parse failed";
      }
    } else {
      results.lunch.error = "Failed to fetch PDF";
    }
  } else {
    results.lunch.fetched = true;
    results.lunch.parsed = true;
    results.lunch.saved = true;
  }

  // Fetch and process dinner menu if not already present
  if (!hasDinner) {
    console.log(`Fetching dinner PDF from ${DINNER_PDF_URL}`);
    const dinnerBuffer = await fetchPdfFromUrl(DINNER_PDF_URL);

    if (dinnerBuffer) {
      results.dinner.fetched = true;
      const parseResult = await parsePdfBuffer(dinnerBuffer, year, month, 1, []);

      if (parseResult.success && parseResult.menus) {
        results.dinner.parsed = true;
        const saveResult = await updateDinnerMenus(year, month, parseResult.menus);
        results.dinner.saved = saveResult.success;
        if (!saveResult.success) {
          results.dinner.error = "Failed to save to GitHub";
        }
      } else {
        results.dinner.error = parseResult.error || "Parse failed";
      }
    } else {
      results.dinner.error = "Failed to fetch PDF";
    }
  } else {
    results.dinner.fetched = true;
    results.dinner.parsed = true;
    results.dinner.saved = true;
  }

  const success = results.lunch.saved && results.dinner.saved;

  // Notify via Telegram if auto-fetch failed
  if (!success) {
    const errors = [
      results.lunch.error ? `Lunch: ${results.lunch.error}` : null,
      results.dinner.error ? `Dinner: ${results.dinner.error}` : null,
    ].filter(Boolean).join("\n");

    await sendTelegramMessage(
      `⚠️ *Auto-fetch menú ha fallat*\n\n${errors}\n\nCaldrà pujar els PDFs manualment.`
    );
  }

  return NextResponse.json({
    success,
    year,
    month,
    day,
    results,
  });
}
