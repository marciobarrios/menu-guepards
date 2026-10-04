import { NextRequest, NextResponse } from "next/server";
import { getTodayMenus } from "@/lib/storage";
import { sendTelegramMessage, formatMenuMessage, CATALAN_MONTHS } from "@/lib/telegram";
import { requireCronAuthorization, requireOwnerAuthorization } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireCronAuthorization(request);
  if (denied) return denied;

  try {
    const { lunch, dinner, month, year, day } = await getTodayMenus();

    // Check if today is a weekend (0 = Sunday, 6 = Saturday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({
        success: true,
        message: "Weekend - no menu sent",
        skipped: true,
      });
    }

    // Check if we have any menu for today
    if (!lunch && !dinner) {
      return NextResponse.json({
        success: true,
        message: `No menu available for ${day}/${month}/${year}`,
        skipped: true,
      });
    }

    const monthName = CATALAN_MONTHS[month - 1];
    const message = formatMenuMessage(
      lunch?.dishes || null,
      dinner?.dishes || null,
      day,
      monthName
    );

    const result = await sendTelegramMessage(message, {
      includeWhatsAppShare: true,
    });

    return NextResponse.json({
      success: result.success,
      message: result.success ? "Menu sent successfully" : result.error,
      menuSent: message,
    });
  } catch (error) {
    console.error("Send menu error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers from UI
export async function POST(request: NextRequest) {
  const denied = requireOwnerAuthorization(request);
  if (denied) return denied;

  try {
    const { lunch, dinner, month, year, day } = await getTodayMenus();

    if (!lunch && !dinner) {
      return NextResponse.json({
        success: false,
        error: `No hi ha menú disponible per al dia ${day}/${month}/${year}`,
      });
    }

    const monthName = CATALAN_MONTHS[month - 1];
    const message = formatMenuMessage(
      lunch?.dishes || null,
      dinner?.dishes || null,
      day,
      monthName
    );

    const result = await sendTelegramMessage(message, {
      includeWhatsAppShare: true,
    });

    return NextResponse.json({
      success: result.success,
      message: result.success ? "Missatge enviat!" : result.error,
      menuSent: message,
    });
  } catch (error) {
    console.error("Send menu error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
