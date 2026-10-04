import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/parse-menu/route";
import { parsePdfBuffer } from "@/lib/menuParser";
import { updateLunchMenus, updateDinnerMenus } from "@/lib/storage";
import { MAX_PDF_BYTES, readUploadForm } from "@/lib/pdfValidation";

vi.mock("@/lib/menuParser", () => ({ parsePdfBuffer: vi.fn() }));
vi.mock("@/lib/storage", () => ({ updateLunchMenus: vi.fn(), updateDinnerMenus: vi.fn() }));
const meal = [{ day: 5, dishes: ["Test meal"] }];

function upload() {
  const form = new FormData();
  form.set("file", new Blob(["%PDF-1.7\nmock content\n%%EOF\n"], { type: "application/pdf" }), "menu.pdf");
  form.set("year", "2026");
  form.set("month", "10");
  form.set("type", "lunch");
  form.set("save", "false");
  return form;
}
function request(body: FormData) {
  return new NextRequest("http://localhost/api/parse-menu", {
    method: "POST", body, headers: { authorization: "Bearer test-only-owner-secret" },
  });
}

beforeEach(() => {
  vi.mocked(parsePdfBuffer).mockResolvedValue({ success: true, menus: meal });
  vi.mocked(updateLunchMenus).mockResolvedValue({ success: true });
  vi.mocked(updateDinnerMenus).mockResolvedValue({ success: true });
});

it.each([
  ["file", "text is not a file", 400], ["type", "other", 400],
  ["year", "2026suffix", 400], ["month", "010", 400], ["save", "yes", 400],
] as const)("rejects invalid %s before parsing", async (field, value, status) => {
  const form = upload();
  form.set(field, value);
  expect((await POST(request(form))).status).toBe(status);
  expect(parsePdfBuffer).not.toHaveBeenCalled();
  expect(updateLunchMenus).not.toHaveBeenCalled();
});

it.each([
  ["text/html", "menu.pdf", "<html>not PDF</html>", 415],
  ["application/pdf", "menu.html", "%PDF-1.7\n%%EOF", 415],
  ["application/pdf", "menu.pdf", "<html>not PDF</html>", 400],
  ["application/pdf", "menu.pdf", "%PDF-1.7\ntruncated", 400],
  ["application/pdf", "menu.pdf", "", 413],
] as const)("rejects file metadata/content %s %s", async (type, name, content, status) => {
  const form = upload();
  form.set("file", new Blob([content], { type }), name);
  expect((await POST(request(form))).status).toBe(status);
  expect(parsePdfBuffer).not.toHaveBeenCalled();
});

it("rejects an oversized PDF before parsing", async () => {
  const form = upload();
  form.set("file", new Blob([new Uint8Array(MAX_PDF_BYTES + 1)], { type: "application/pdf" }), "menu.pdf");
  expect((await POST(request(form))).status).toBe(413);
  expect(parsePdfBuffer).not.toHaveBeenCalled();
});

it("rejects duplicate form fields", async () => {
  const form = upload();
  form.append("year", "2027");
  expect((await POST(request(form))).status).toBe(400);
  expect(parsePdfBuffer).not.toHaveBeenCalled();
});

it("rejects oversize Content-Length before reading the body", async () => {
  const req = request(upload());
  req.headers.set("content-length", String(MAX_PDF_BYTES * 2));
  expect((await POST(req)).status).toBe(413);
  expect(req.bodyUsed).toBe(false);
});

it("caps chunked requests without trusting Content-Length and cancels the stream", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel,
  });
  const req = new Request("http://localhost/upload", {
    method: "POST", body, duplex: "half", headers: { "content-type": "multipart/form-data; boundary=test", "content-length": "1" },
  } as RequestInit);
  await expect(readUploadForm(req)).rejects.toMatchObject({ status: 413 });
  expect(cancel).toHaveBeenCalledOnce();
});

it("returns a client error for malformed multipart input", async () => {
  const req = new NextRequest("http://localhost/upload", { method: "POST", body: "bad", headers: {
    "content-type": "multipart/form-data; boundary=test", authorization: "Bearer test-only-owner-secret",
  } });
  expect((await POST(req)).status).toBe(400);
});

it("previews a validated PDF without writing", async () => {
  const response = await POST(request(upload()));
  expect(await response.json()).toEqual({ success: true, menus: meal, saved: false });
  expect(parsePdfBuffer).toHaveBeenCalledWith(expect.any(Buffer), 2026, 10);
  expect(updateLunchMenus).not.toHaveBeenCalled();
});

it.each(["lunch", "dinner"] as const)("saves only the requested %s menu", async type => {
  const form = upload();
  form.set("type", type);
  form.set("save", "true");
  expect((await (await POST(request(form))).json()).saved).toBe(true);
  expect(type === "lunch" ? updateLunchMenus : updateDinnerMenus).toHaveBeenCalledExactlyOnceWith(2026, 10, meal);
  expect(type === "lunch" ? updateDinnerMenus : updateLunchMenus).not.toHaveBeenCalled();
});

it("does not save a PDF rejected by the parser/month validation", async () => {
  vi.mocked(parsePdfBuffer).mockResolvedValue({ success: false, error: "Wrong month" });
  const form = upload();
  form.set("save", "true");
  expect((await POST(request(form))).status).toBe(400);
  expect(updateLunchMenus).not.toHaveBeenCalled();
});
