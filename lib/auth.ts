import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function requireBearerAuthorization(
  request: Request,
  secret: string | undefined,
  unavailableMessage: string,
  unauthorizedMessage: string
): NextResponse | null {
  const headers = { "Cache-Control": "no-store" };
  if (!secret?.trim()) {
    return NextResponse.json(
      { success: false, error: unavailableMessage },
      { status: 503, headers }
    );
  }
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ success: false, error: unauthorizedMessage }, { status: 401, headers });
  }
  return null;
}

export function requireCronAuthorization(request: Request): NextResponse | null {
  return requireBearerAuthorization(request, process.env.CRON_SECRET,
    "Scheduled operations are not configured", "Unauthorized");
}

export function requireOwnerAuthorization(request: Request): NextResponse | null {
  // Deliberately separate from cron: never fall back to its credential.
  return requireBearerAuthorization(request, process.env.OWNER_SECRET,
    "Les accions de propietari encara no estan configurades.",
    "Clau de propietari incorrecta o absent.");
}
