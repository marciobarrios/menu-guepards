import { NextRequest, NextResponse } from "next/server";
import { loadMenus, listAvailableMonths } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  // If year and month provided, return that month's menus
  if (year && month) {
    const menus = await loadMenus(parseInt(year, 10), parseInt(month, 10));
    if (!menus) {
      return NextResponse.json({
        success: false,
        error: "No menus found for this month",
      });
    }
    return NextResponse.json({ success: true, menus });
  }

  // Otherwise, return list of available months
  const months = await listAvailableMonths();
  return NextResponse.json({ success: true, months });
}
