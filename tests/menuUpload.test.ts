import { expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { createMenuUploadForm } from "@/lib/menuUpload";
import { parsePdfBuffer } from "@/lib/menuParser";
import { menuPdf } from "./fixtures/menu-pdf.mjs";

it.each([false, true])("uploads only the first page for preview/save=%s and preserves the title", async save => {
  const original = menuPdf("novembre 2026", ["- Standard menu", "- Dietary variant"]);
  const file = new File([original], "MENUS - Novembre.pdf", { type: "application/pdf" });
  const form = await createMenuUploadForm(file, "lunch", 2026, 11, save);
  const uploaded = form.get("file") as File;
  const bytes = await uploaded.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getTitle()).toBe("novembre 2026");
  expect(uploaded.name).toBe(file.name);
  expect(form.get("save")).toBe(String(save));
  expect(form.get("month")).toBe("11");
  const result = await parsePdfBuffer(Buffer.from(bytes), 2026, 11);
  expect(result.menus).toEqual([2, 3, 4, 5, 6].map(day => ({ day, dishes: ["Standard menu"] })));
});

it("reduces a source bundle larger than the server limit before upload", async () => {
  const source = await PDFDocument.load(menuPdf());
  await source.attach(randomBytes(5 * 1024 * 1024), "large-attachment.bin");
  const bytes = await source.save();
  const file = new File([new Uint8Array(bytes)], "menu.pdf", { type: "application/pdf" });
  expect(file.size).toBeGreaterThan(4 * 1024 * 1024);
  const form = await createMenuUploadForm(file, "lunch", 2026, 10, false);
  expect((form.get("file") as File).size).toBeLessThan(4 * 1024 * 1024);
});

it("does not manufacture a period for a source with an empty title", async () => {
  const file = new File([menuPdf("")], "novembre 2026.pdf", { type: "application/pdf" });
  const form = await createMenuUploadForm(file, "lunch", 2026, 11, false);
  const uploaded = await PDFDocument.load(await (form.get("file") as File).arrayBuffer());
  expect(uploaded.getTitle()).toBeUndefined();
});

it("rejects malformed PDFs with a useful message", async () => {
  const file = new File(["broken"], "menu.pdf", { type: "application/pdf" });
  await expect(createMenuUploadForm(file, "lunch", 2026, 11, false)).rejects.toThrow("malmès");
});
