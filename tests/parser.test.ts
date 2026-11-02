import { expect, it } from "vitest";
import { parsePdfBuffer } from "@/lib/menuParser";
import { menuPdf } from "./fixtures/menu-pdf.mjs";

it("parses a complete local fixture after PDF validation", async () => {
  const result = await parsePdfBuffer(menuPdf(), 2026, 10);
  expect(result.success).toBe(true);
  expect(result.menus).toEqual([5, 6, 7, 8, 9].map(day => ({ day, dishes: ["Test dish"] })));
});

it("still rejects a valid PDF from a different month", async () => {
  const result = await parsePdfBuffer(menuPdf("setembre 2026"), 2026, 10);
  expect(result.success).toBe(false);
  expect(result.error).toContain("setembre 2026");
});

it.each([
  ["- Standard lunch", "- Gluten-free variant", "- Vegetarian variant"],
  ["- Standard lunch", "Dinner-format variant"],
  ["Standard dinner", "- Lunch-format variant"],
])("uses only page 1 for dishes and format detection (%s)", async (...pages) => {
  const result = await parsePdfBuffer(menuPdf("novembre 2026", pages), 2026, 11);
  expect(result).toEqual({
    success: true,
    menus: [2, 3, 4, 5, 6].map(day => ({ day, dishes: [pages[0].replace(/^- /, "")] })),
  });
});

it("does not fall back to a dietary variant when page 1 has no menu", async () => {
  const result = await parsePdfBuffer(menuPdf("novembre 2026", ["", "- Variant dish"]), 2026, 11);
  expect(result).toEqual({ success: false, error: "No s'han trobat plats al PDF" });
});

it("rejects content with a forged header/footer that is not structurally a PDF", async () => {
  expect((await parsePdfBuffer(Buffer.from("%PDF-1.7\nbroken\n%%EOF\n"), 2026, 10)).success).toBe(false);
});

it("requires a detectable period for automatic fetching even with a valid grid", async () => {
  expect((await parsePdfBuffer(menuPdf(""), 2026, 11)).success).toBe(false);
});

it("allows manual preview of a missing period with an explicit warning", async () => {
  const result = await parsePdfBuffer(menuPdf(""), 2026, 11, { allowMissingPeriod: true });
  expect(result.success).toBe(true);
  expect(result.warning).toContain("novembre 2026");
  expect(result.warning).toContain("abans de guardar");
});

it("still rejects a known wrong period for manual uploads", async () => {
  const result = await parsePdfBuffer(menuPdf("octubre 2026"), 2026, 11, { allowMissingPeriod: true });
  expect(result.success).toBe(false);
  expect(result.error).toContain("octubre 2026");
});
