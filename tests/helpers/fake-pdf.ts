/** Builds a minimal PDF with text at fixed positions (Helvetica, no embedding). Test-only. */
export interface Placed {
  text: string;
  x: number;
  y: number;
  size?: number;
  /** Right-align at x */
  right?: boolean;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
// Helvetica average glyph width ≈ 0.5em is good enough for right alignment in tests.
const width = (s: string, size: number) => s.length * size * 0.5;

export function buildPdf(pages: Placed[][]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) ;
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // pages placeholder
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const items of pages) {
    const stream = items
      .map((i) => {
        const size = i.size ?? 7;
        const x = i.right ? i.x - width(i.text, size) : i.x;
        return `BT /F1 ${size} Tf ${x.toFixed(2)} ${i.y.toFixed(2)} Td (${esc(i.text)}) Tj ET`;
      })
      .join('\n');
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const contentId = objects.length;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    kids.push(objects.length);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

/** A fake HDFC-style statement. All names and numbers are invented. */
export interface FakeRow {
  date: string;
  narration: string[];
  ref: string;
  w?: string;
  d?: string;
  bal: string;
}

export function fakeHdfcStatement(holder: string, pagesOfRows: FakeRow[][], summary: string[]): Uint8Array {
  const pages = pagesOfRows.map((rows, pi) => {
    const items: Placed[] = [
      { text: `Page No .: ${pi + 1}`, x: 250, y: 820 },
      // Salutation and name are separate runs; the address column shares the line.
      { text: holder.split(' ')[0], x: 34, y: 780 },
      { text: holder.split(' ').slice(1).join(' '), x: 58, y: 780 },
      { text: 'City', x: 340, y: 780 },
      { text: ': SAMPLETOWN', x: 397, y: 780 },
      { text: '12 SAMPLE STREET', x: 50, y: 770 },
      { text: 'Account No', x: 330, y: 760 },
      { text: ': 50100000009999 Classic', x: 380, y: 760 },
      { text: 'Account Type', x: 330, y: 750 },
      { text: ': SAVINGS A/C - REGULAR', x: 380, y: 750 },
      { text: 'Statement From : 01/04/2026', x: 50, y: 720 },
      { text: 'To : 15/10/2026', x: 160, y: 720 },
    ];
    const hy = 700;
    // Like HDFC, the column header appears on the first page only.
    if (pi === 0) items.push(
      { text: 'Date', x: 40, y: hy },
      { text: 'Narration', x: 140, y: hy },
      { text: 'Chq./Ref.No.', x: 290, y: hy },
      { text: 'Value Dt', x: 345, y: hy },
      { text: 'Withdrawal Amt.', x: 390, y: hy },
      { text: 'Deposit Amt.', x: 460, y: hy },
      { text: 'Closing Balance', x: 520, y: hy },
    );
    let y = hy - 14;
    for (const r of rows) {
      if (!r.date) {
        // Narration spilling over from the previous page
        for (const extra of r.narration) {
          items.push({ text: extra, x: 72, y });
          y -= 10;
        }
        y -= 4;
        continue;
      }
      items.push({ text: r.date, x: 40, y });
      if (r.narration[0]) items.push({ text: r.narration[0], x: 72, y });
      if (r.ref) items.push({ text: r.ref, x: 340, y, right: true });
      if (r.date) items.push({ text: r.date, x: 345, y });
      if (r.w) items.push({ text: r.w, x: 450, y, right: true });
      if (r.d) items.push({ text: r.d, x: 510, y, right: true });
      items.push({ text: r.bal, x: 580, y, right: true });
      for (const extra of r.narration.slice(1)) {
        y -= 10;
        items.push({ text: extra, x: 72, y });
      }
      y -= 14;
    }
    if (pi === pagesOfRows.length - 1 && summary.length) {
      y -= 10;
      items.push({ text: 'STATEMENT SUMMARY :-', x: 60, y });
      y -= 10;
      ['Opening Balance', 'Dr Count', 'Cr Count', 'Debits', 'Credits', 'Closing Bal'].forEach((t, i) => items.push({ text: t, x: 60 + i * 85, y }));
      y -= 10;
      summary.forEach((t, i) => items.push({ text: t, x: 60 + i * 85, y }));
    }
    items.push({ text: 'HDFC BANK LIMITED', x: 40, y: 60 });
    items.push({ text: '*Closing balance includes funds earmarked for hold and uncleared funds', x: 40, y: 50 });
    return items;
  });
  return buildPdf(pages);
}
