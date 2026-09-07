import { NextRequest, NextResponse } from "next/server";
import { parsePdfBuffer } from "@/lib/menuParser";
import { updateLunchMenus, updateDinnerMenus } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null; // "lunch" or "dinner"
    const year = parseInt(formData.get("year") as string, 10);
    const month = parseInt(formData.get("month") as string, 10);
    const save = formData.get("save") === "true";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (!type || !["lunch", "dinner"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Type must be 'lunch' or 'dinner'" },
        { status: 400 }
      );
    }

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { success: false, error: "Invalid year or month" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parsePdfBuffer(buffer, year, month);

    if (!result.success || !result.menus) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Save if requested
    if (save) {
      const saveResult = type === "lunch"
        ? await updateLunchMenus(year, month, result.menus)
        : await updateDinnerMenus(year, month, result.menus);

      if (!saveResult.success) {
        return NextResponse.json({
          success: false,
          error: "Error guardant a GitHub. Comprova el GITHUB_TOKEN.",
          menus: result.menus,
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      menus: result.menus,
      saved: save,
    });
  } catch (error) {
    console.error("Parse error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
