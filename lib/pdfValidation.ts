export const MAX_PDF_BYTES = 4 * 1024 * 1024;
// Bound multipart overhead too, including requests without Content-Length.
const MAX_UPLOAD_BYTES = MAX_PDF_BYTES + 64 * 1024;

export class UploadError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function readUploadForm(request: Request): Promise<FormData> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new UploadError("Expected a multipart PDF upload", 415);
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_UPLOAD_BYTES)) {
    throw new UploadError("Upload is too large (PDF limit: 4 MiB)", 413);
  }
  if (!request.body) throw new UploadError("No file uploaded", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new UploadError("Upload is too large (PDF limit: 4 MiB)", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return await new Response(body, { headers: request.headers }).formData();
  } catch {
    throw new UploadError("Invalid multipart upload", 400);
  }
}

export function validatePdfBuffer(buffer: Buffer): string | null {
  if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) {
    return "PDF must be non-empty and no larger than 4 MiB";
  }
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(buffer.subarray(0, 9).toString("latin1")) ||
      !/%%EOF\s*$/.test(buffer.subarray(-1024).toString("latin1"))) {
    return "File content is not a complete PDF";
  }
  return null;
}

export async function readPdfFile(file: FormDataEntryValue | null): Promise<Buffer> {
  if (!file || typeof file === "string") throw new UploadError("No PDF file uploaded", 400);
  if (file.type.toLowerCase() !== "application/pdf" || !/\.pdf$/i.test(file.name)) {
    throw new UploadError("File must have a .pdf name and application/pdf type", 415);
  }
  if (file.size === 0 || file.size > MAX_PDF_BYTES) {
    throw new UploadError("PDF must be non-empty and no larger than 4 MiB", 413);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const error = validatePdfBuffer(buffer);
  if (error) throw new UploadError(error, 400);
  return buffer;
}
