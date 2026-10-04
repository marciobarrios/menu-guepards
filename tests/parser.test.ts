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

it("rejects content with a forged header/footer that is not structurally a PDF", async () => {
  expect((await parsePdfBuffer(Buffer.from("%PDF-1.7\nbroken\n%%EOF\n"), 2026, 10)).success).toBe(false);
});
