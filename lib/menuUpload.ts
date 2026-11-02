// Keep large variant bundles in the browser; only page 1 goes to the server.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export async function createMenuUploadForm(
  file: File,
  type: "lunch" | "dinner",
  year: number,
  month: number,
  save: boolean,
): Promise<FormData> {
  if (!/\.pdf$/i.test(file.name) || file.type.toLowerCase() !== "application/pdf") {
    throw new Error("Selecciona un fitxer PDF.");
  }
  if (!file.size || file.size > MAX_SOURCE_BYTES) {
    throw new Error("El PDF ha de tenir contingut i no superar els 20 MiB.");
  }

  const { PDFDocument } = await import("pdf-lib");
  let bytes: Uint8Array;
  try {
    const source = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
    if (!source.getPageCount()) throw new Error("Empty PDF");
    const standard = await PDFDocument.create();
    const [firstPage] = await standard.copyPages(source, [0]);
    standard.addPage(firstPage);
    const title = source.getTitle();
    if (title) standard.setTitle(title);
    bytes = await standard.save();
  } catch {
    throw new Error("No s'ha pogut llegir el PDF. Comprova que no estigui malmès ni protegit amb contrasenya.");
  }

  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), file.name);
  form.set("type", type);
  form.set("year", String(year));
  form.set("month", String(month));
  form.set("save", String(save));
  return form;
}
