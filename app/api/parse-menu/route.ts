import { NextRequest, NextResponse } from "next/server";
import { parsePdfBuffer } from "@/lib/menuParser";
import { updateLunchMenus, updateDinnerMenus } from "@/lib/storage";
import { parseMenuDate } from "@/lib/menuDate";
import { readUploadForm, readPdfFile, UploadError } from "@/lib/pdfValidation";
import { requireOwnerAuthorization } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const denied = requireOwnerAuthorization(request);
  if (denied) return denied;

  try {
    const formData = await readUploadForm(request);
    for (const field of ["file", "type", "year", "month", "save"]) {
      if (formData.getAll(field).length > 1) throw new UploadError(`Duplicate ${field} field`, 400);
    }
    const type = formData.get("type");
    const date = parseMenuDate(formData.get("year"), formData.get("month"));
    const saveValue = formData.get("save") ?? "false";
    if (saveValue !== "true" && saveValue !== "false") throw new UploadError("Invalid save flag", 400);
    const save = saveValue === "true";

    if (type !== "lunch" && type !== "dinner") {
      return NextResponse.json(
        { success: false, error: "Type must be 'lunch' or 'dinner'" },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { success: false, error: "Invalid year or month" },
        { status: 400 }
      );
    }

    const { year, month } = date;
    const buffer = await readPdfFile(formData.get("file"));
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
    if (error instanceof UploadError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Parse error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Unable to process PDF upload",
      },
      { status: 500 }
    );
  }
}
