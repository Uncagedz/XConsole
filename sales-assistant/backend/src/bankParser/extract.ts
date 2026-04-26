import fs from 'node:fs';
import pdf from 'pdf-parse';

export interface ExtractedPdfText {
  filePath: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export async function extractPdfText(filePath: string): Promise<ExtractedPdfText> {
  const buffer = fs.readFileSync(filePath);
  const parsed = await pdf(buffer);
  const metadata =
    parsed.metadata && typeof parsed.metadata === 'object'
      ? (parsed.metadata as Record<string, unknown>)
      : undefined;
  return {
    filePath,
    text: parsed.text,
    metadata,
  };
}
