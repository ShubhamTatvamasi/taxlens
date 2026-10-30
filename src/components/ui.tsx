import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { money, parseAmount } from '../lib/format';

export function Money({ value, decimals = false, className = '' }: { value: number; decimals?: boolean; className?: string }) {
  return <span class={`num ${className}`}>{money(value, decimals)}</span>;
}

export function Card(props: { title?: ComponentChildren; subtitle?: ComponentChildren; actions?: ComponentChildren; children: ComponentChildren; className?: string; id?: string }) {
  return (
    <section class={`card ${props.className ?? ''}`} id={props.id}>
      {(props.title || props.actions) && (
        <div class="card-head">
          <div>
            {props.title && <h2>{props.title}</h2>}
            {props.subtitle && <p>{props.subtitle}</p>}
          </div>
          {props.actions && <div class="row">{props.actions}</div>}
        </div>
      )}
      {props.children}
    </section>
  );
}

export function Stat(props: { label: ComponentChildren; value: ComponentChildren; sub?: ComponentChildren; accent?: boolean; glyph?: string }) {
  return (
    <div class={`card stat ${props.accent ? 'accent' : ''}`}>
      {props.glyph && <span class="glyph" aria-hidden="true">{props.glyph}</span>}
      <div class="label">{props.label}</div>
      <div class="value num">{props.value}</div>
      {props.sub && <div class="sub">{props.sub}</div>}
    </div>
  );
}

/** Rupee input that accepts 1,50,000 / 1.5L / 2cr and keeps formatting while not focused. */
export function MoneyField(props: {
  label: ComponentChildren;
  value: number;
  onChange: (v: number) => void;
  hint?: ComponentChildren;
  fromStatement?: number;
  disabled?: boolean;
  /** Losses: allow a leading minus */
  allowNegative?: boolean;
}) {
  const [text, setText] = useState(props.value ? props.value.toLocaleString('en-IN') : '');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(props.value ? props.value.toLocaleString('en-IN') : '');
  }, [props.value, focused]);
  return (
    <div class="field">
      <label>
        <span>{props.label}</span>
        {!!props.fromStatement && <span class="from-stmt" title="Added automatically from your statement">+{money(props.fromStatement)} stmt</span>}
      </label>
      <div class="input-wrap">
        <span class="prefix">₹</span>
        <input
          class="input money"
          inputMode="decimal"
          value={text}
          disabled={props.disabled}
          placeholder="0"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(props.value ? props.value.toLocaleString('en-IN') : '');
          }}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            setText(v);
            const n = parseAmount(v);
            props.onChange(props.allowNegative ? n : Math.max(0, n));
          }}
        />
      </div>
      {props.hint && <span class="hint">{props.hint}</span>}
    </div>
  );
}

export function NumberField(props: { label: ComponentChildren; value: number; onChange: (v: number) => void; step?: number; suffix?: string; hint?: ComponentChildren; min?: number }) {
  return (
    <div class="field">
      <label>{props.label}</label>
      <input
        class="input money"
        type="number"
        step={props.step ?? 1}
        min={props.min}
        value={Number.isFinite(props.value) ? props.value : ''}
        onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value) || 0)}
      />
      {props.hint && <span class="hint">{props.hint}</span>}
    </div>
  );
}

export function DateField(props: { label: ComponentChildren; value: string; onChange: (v: string) => void; hint?: ComponentChildren; min?: string; max?: string }) {
  return (
    <div class="field">
      <label>{props.label}</label>
      <input class="input" type="date" value={props.value} min={props.min} max={props.max} onInput={(e) => props.onChange((e.target as HTMLInputElement).value)} />
      {props.hint && <span class="hint">{props.hint}</span>}
    </div>
  );
}

export function Select<T extends string>(props: { label?: ComponentChildren; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: ComponentChildren }) {
  return (
    <div class="field">
      {props.label && <label>{props.label}</label>}
      <select class="input" value={props.value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value as T)}>
        {props.options.map((o) => (
          <option value={o.value}>{o.label}</option>
        ))}
      </select>
      {props.hint && <span class="hint">{props.hint}</span>}
    </div>
  );
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: ComponentChildren }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div class="seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button type="button" aria-pressed={o.value === props.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: ComponentChildren; hint?: ComponentChildren }) {
  return (
    <label class="check" style="align-items:flex-start">
      <span class="switch">
        <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
        <span />
      </span>
      <span>
        <span style="font-weight:600">{props.label}</span>
        {props.hint && <span class="hint" style="display:block;font-size:12px;color:var(--text-3)">{props.hint}</span>}
      </span>
    </label>
  );
}

const ICONS: Record<string, string> = { action: '!', warn: '⚠', info: 'i', good: '✓' };

export function Alert(props: { level: 'info' | 'warn' | 'action' | 'good'; title: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class={`alert ${props.level} fade-in`}>
      <div class="ico">{ICONS[props.level]}</div>
      <div>
        <h4>{props.title}</h4>
        {props.children && <p>{props.children}</p>}
      </div>
    </div>
  );
}

export function Empty(props: { icon: string; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="big">{props.icon}</div>
      <h3>{props.title}</h3>
      {props.children && <p class="mt">{props.children}</p>}
    </div>
  );
}
