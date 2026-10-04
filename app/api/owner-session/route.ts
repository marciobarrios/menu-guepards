import { NextRequest, NextResponse } from "next/server";
import { requireOwnerBearerAuthorization } from "@/lib/auth";
import { clearOwnerSession, createOwnerSession, getOwnerSession, requestOrigin, requireSameOrigin, setOwnerSession } from "@/lib/ownerSession";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  // Do not refresh cookies from an embedding page or a sibling subdomain.
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if ((site && site !== "same-origin") || (origin && origin !== requestOrigin(request))) {
    return NextResponse.json({ success: false }, { status: 403, headers });
  }
  const token = getOwnerSession(request);
  const response = NextResponse.json({ success: true, remembered: Boolean(token) }, { headers });
  if (token) setOwnerSession(response, request, token);
  return response;
}

export async function POST(request: NextRequest) {
  const denied = requireSameOrigin(request) || requireOwnerBearerAuthorization(request);
  if (denied) return denied;
  const response = NextResponse.json({ success: true, remembered: true }, { headers });
  setOwnerSession(response, request, createOwnerSession(request));
  return response;
}

export async function DELETE(request: NextRequest) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  // Clearing this browser's cookie also works after the owner secret rotates.
  const response = NextResponse.json({ success: true, remembered: false }, { headers });
  clearOwnerSession(response, request);
  return response;
}
