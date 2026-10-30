import { useRef, useState } from 'preact/hooks';
import type { ParsedStatement } from '../lib/statement/hdfc';

interface Pending {
  file: File;
  status: 'reading' | 'password' | 'error' | 'done';
  message?: string;
  password?: string;
}

export function Upload(props: { onParsed: (p: ParsedStatement) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (file: File, patch: Partial<Pending>) =>
    setPending((list) => list.map((p) => (p.file === file ? { ...p, ...patch } : p)));

  async function read(file: File, password?: string) {
    update(file, { status: 'reading', message: undefined });
    try {
      // Loaded lazily so the landing page stays light.
      const { parseStatementFile, PasswordError } = await import('../lib/statement/pdf');
      try {
        const parsed = await parseStatementFile(file, password);
        props.onParsed(parsed);
        update(file, { status: 'done', message: `${parsed.transactions.length} transactions` });
        setTimeout(() => setPending((l) => l.filter((p) => p.file !== file)), 2500);
      } catch (e) {
        if (e instanceof PasswordError)
          update(file, { status: 'password', message: e.incorrect ? 'Incorrect password — try again.' : 'This PDF is password-protected.' });
        else throw e;
      }
    } catch (e) {
      update(file, { status: 'error', message: (e as Error).message || 'Could not read this PDF.' });
    }
  }

  function addFiles(files: FileList | File[]) {
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return;
    setPending((l) => [...l, ...pdfs.map((file) => ({ file, status: 'reading' as const }))]);
    pdfs.forEach((f) => read(f));
  }

  return (
    <div>
      <div
        class={`drop ${over ? 'over' : ''}`}
        style={props.compact ? 'padding:22px' : undefined}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
        }}
      >
        {!props.compact && <div class="big">📄</div>}
        <h3>{props.compact ? 'Add another statement' : 'Drop HDFC Bank statement PDFs here'}</h3>
        <p>
          or click to choose · multiple files & accounts supported · read locally with PDF.js
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            const t = e.target as HTMLInputElement;
            if (t.files) addFiles(t.files);
            t.value = '';
          }}
        />
      </div>
      {pending.length > 0 && (
        <div class="stack mt" style="gap:8px">
          {pending.map((p) => (
            <div class="card fade-in" style="padding:12px 14px">
              <div class="row between">
                <div class="row" style="gap:8px">
                  <span>{p.status === 'reading' ? '⏳' : p.status === 'done' ? '✅' : p.status === 'password' ? '🔑' : '⚠️'}</span>
                  <b class="small">{p.file.name}</b>
                  {p.message && <span class={`small ${p.status === 'error' ? 'cr' : 'muted'}`} style={p.status === 'error' ? 'color:var(--neg)' : ''}>{p.message}</span>}
                </div>
                {p.status !== 'reading' && p.status !== 'done' && (
                  <button class="icon-btn" aria-label="Dismiss" onClick={() => setPending((l) => l.filter((x) => x !== p))}>✕</button>
                )}
              </div>
              {p.status === 'password' && (
                <form
                  class="row mt"
                  onSubmit={(e) => {
                    e.preventDefault();
                    read(p.file, p.password);
                  }}
                >
                  <input
                    class="input"
                    style="max-width:260px"
                    type="password"
                    autoComplete="off"
                    placeholder="PDF password"
                    value={p.password ?? ''}
                    onInput={(e) => update(p.file, { password: (e.target as HTMLInputElement).value })}
                  />
                  <button class="btn primary sm" type="submit">Unlock</button>
                  <span class="tiny faint">HDFC usually uses your Customer ID. The password is used only to open the file here.</span>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
