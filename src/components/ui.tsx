import type { ReactNode } from 'react';
import { PROVENANCE_LABEL, SOURCES, type Provenance } from '../data/sources';

export function Badge({ kind }: { kind: Provenance }) {
  return <span className={`prov prov--${kind}`}>{PROVENANCE_LABEL[kind]}</span>;
}

export function SourceNote({ ids, extra }: { ids: (keyof typeof SOURCES)[]; extra?: string }) {
  return (
    <p className="source-note">
      Izvor:{' '}
      {ids.map((id, i) => {
        const s = SOURCES[id];
        return (
          <span key={id}>
            {i > 0 && '; '}
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.name}
            </a>{' '}
            ({s.publisher}, {s.license}; {s.referenceDate})
          </span>
        );
      })}
      {extra && <> · {extra}</>}
    </p>
  );
}

export function Kpi({ label, value, kind, hint }: { label: string; value: ReactNode; kind: Provenance; hint?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      <Badge kind={kind} />
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function Bar({ value, max = 1, color, label, right }: { value: number; max?: number; color?: string; label: string; right: string }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${w}%`, background: color }} />
      </span>
      <span className="bar-right">{right}</span>
    </div>
  );
}

export function Panel({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`panel${wide ? ' panel--wide' : ''}`}>
      <header className="panel-head">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
