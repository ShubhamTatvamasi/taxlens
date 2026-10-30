import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseHdfcItems, type ParsedStatement, type TextItem } from './hdfc';

GlobalWorkerOptions.workerSrc = workerUrl;

export class PasswordError extends Error {
  constructor(public readonly incorrect: boolean) {
    super(incorrect ? 'Incorrect password' : 'Password required');
  }
}

/** Reads all text with positions. The file is processed entirely in this browser tab. */
export async function extractItems(data: ArrayBuffer, password?: string): Promise<TextItem[]> {
  const task = getDocument({
    data: new Uint8Array(data),
    password,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    // Font data for PDFs that don't embed fonts; served from this site, never a CDN.
    standardFontDataUrl: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/pdfjs/standard_fonts/`,
    cMapUrl: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/pdfjs/cmaps/`,
    cMapPacked: true,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException') throw new PasswordError(err.code === 2);
    throw e;
  }
  const items: TextItem[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      for (const it of content.items) {
        if (!('str' in it)) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, page: p });
      }
    }
  } finally {
    // Frees the worker and the decoded document from memory.
    await task.destroy();
  }
  return items;
}

export async function parseStatementFile(file: File, password?: string): Promise<ParsedStatement> {
  const items = await extractItems(await file.arrayBuffer(), password);
  return parseHdfcItems(items, file.name);
}
