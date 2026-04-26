declare module 'pdf-parse' {
  type PDFParseOptions = {
    pagerender?(pageData: unknown): Promise<string>;
    max?: number;
  };

  type PDFData = {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  };

  function pdf(buffer: Buffer | Uint8Array, options?: PDFParseOptions): Promise<PDFData>;

  export = pdf;
}
