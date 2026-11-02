declare module "pdf-parse" {
  interface PDFData {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
    version: string;
  }

  interface PDFOptions {
    max?: number;
    pagerender?: (page: any) => Promise<string>;
  }

  function pdfParse(buffer: Uint8Array, options?: PDFOptions): Promise<PDFData>;

  export default pdfParse;
}
