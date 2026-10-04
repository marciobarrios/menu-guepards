import { NextRequest, NextResponse } from "next/server";
import { loadMenus, listAvailableMonths } from "@/lib/storage";
import { parseMenuDate } from "@/lib/menuDate";

// Cache the tagged upstream read, not a second HTTP/CDN copy that could survive a save.
const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  // If year and month provided, return that month's menus
  if (year !== null || month !== null) {
    const date = parseMenuDate(year, month);
    if (!date || searchParams.getAll("year").length !== 1 || searchParams.getAll("month").length !== 1) {
      return NextResponse.json({ success: false, error: "Invalid year or month" }, { status: 400, headers });
    }
    const menus = await loadMenus(date.year, date.month);
    if (!menus) {
      return NextResponse.json({
        success: false,
        error: "No menus found for this month",
      }, { headers });
    }
    return NextResponse.json({ success: true, menus }, { headers });
  }

  // Otherwise, return list of available months
  const months = await listAvailableMonths();
  return NextResponse.json({ success: true, months }, { headers });
}
