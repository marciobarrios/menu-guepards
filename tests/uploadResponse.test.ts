import { expect, it } from "vitest";
import { readMenuUploadResponse } from "@/lib/uploadResponse";

it("explains the platform's non-JSON upload size rejection", async () => {
  await expect(readMenuUploadResponse(new Response("FUNCTION_PAYLOAD_TOO_LARGE", { status: 413 })))
    .rejects.toThrow("4 MiB");
});

it("explains a non-JSON function timeout", async () => {
  await expect(readMenuUploadResponse(new Response("FUNCTION_INVOCATION_TIMEOUT", { status: 504 })))
    .rejects.toThrow("temps processant el PDF");
});

it("preserves specific parser errors", async () => {
  await expect(readMenuUploadResponse(Response.json({ success: false, error: "Wrong month" }, { status: 400 })))
    .rejects.toThrow("Wrong month");
});

it("reports an unexpected non-JSON response with its HTTP status", async () => {
  await expect(readMenuUploadResponse(new Response("<html>Error</html>", { status: 502 })))
    .rejects.toThrow("HTTP 502");
});

it("returns a successful menu preview", async () => {
  const data = { success: true, menus: [{ day: 2, dishes: ["Standard menu"] }] };
  await expect(readMenuUploadResponse(Response.json(data))).resolves.toEqual({ menus: data.menus });
});
