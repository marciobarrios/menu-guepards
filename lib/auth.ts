import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function requireCronAuthorization(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const headers = { "Cache-Control": "no-store" };
  if (!secret?.trim()) {
    return NextResponse.json(
      { success: false, error: "Scheduled operations are not configured" },
      { status: 503, headers }
    );
  }
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401, headers });
  }
  return null;
}
