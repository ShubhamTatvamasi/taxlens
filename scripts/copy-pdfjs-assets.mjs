// Copies PDF.js font data into public/ so the app never fetches it from a CDN.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'pdfjs');
mkdirSync(dest, { recursive: true });
for (const dir of ['standard_fonts', 'cmaps']) cpSync(join(src, dir), join(dest, dir), { recursive: true });
