import { useEffect, useState } from 'react';
import { Panel, Kpi, SourceNote, Badge } from './ui';
import { loadReport, type PipelineReport } from '../lib/data';
import { fmtInt, pct } from '../lib/geo';
import { LESSONS, reward } from '../lib/gamification';
import { SOURCES } from '../data/sources';

interface Props {
  onNavigate: (tab: 'routes' | 'pulse' | 'plan' | 'report') => void;
  onReward: (msg: string) => void;
}

export default function ExploreView({ onNavigate, onReward }: Props) {
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [read, setRead] = useState<Set<string>>(new Set());
  useEffect(() => {
    loadReport().then(setReport, () => setReport(null));
  }, []);

  const markRead = (id: string) => {
    if (read.has(id)) return;
    const next = new Set(read).add(id);
    setRead(next);
    const r = reward('lesson', next.size === LESSONS.length ? 'learner' : undefined);
    onReward(`+${r.points} bodova${r.achievement ? ` · ${r.achievement.title}` : ''}`);
  };

  return (
    <Panel title="Istraži zeleni Zagreb" subtitle="Interaktivna karta okoliša izrađena iz otvorenih podataka Grada Zagreba">
      {report ? (
        <div className="kpi-grid">
          <Kpi label="Grad pod mapiranom vegetacijom" value={pct(report.city.green_share)} kind="izvedeno" />
          <Kpi label="Površina parkova" value={`${report.city.class_area_km2['5']?.toFixed(1).replace('.', ',')} km²`} kind="izmjereno" />
          <Kpi label="Gradskih vrtova" value={report.city.gardens} kind="izmjereno" hint={`${fmtInt(report.city.garden_plots)} vrtnih parcela`} />
          <Kpi label="Pješačka mreža (središte)" value={`${fmtInt(report.graph.total_length_km)} km`} kind="izvedeno" />
        </div>
      ) : (
        <p className="muted">Učitavanje sažetka podataka…</p>
      )}

      <div className="cta-list">
        <button type="button" className="cta" onClick={() => onNavigate('routes')}>
          <strong>Zelena ruta</strong>
          <span>Usporedi najkraću i zeleniju pješačku rutu</span>
        </button>
        <button type="button" className="cta" onClick={() => onNavigate('pulse')}>
          <strong>GreenPulse</strong>
          <span>Zelenilo po gradskim četvrtima</span>
        </button>
        <button type="button" className="cta" onClick={() => onNavigate('plan')}>
          <strong>GreenPlan</strong>
          <span>Gdje bi ozelenjavanje najviše pomoglo?</span>
        </button>
        <button type="button" className="cta" onClick={() => onNavigate('report')}>
          <strong>Prijavi problem</strong>
          <span>Otpad, oštećena stabla, parkovi</span>
        </button>
      </div>

      <h2>Učite o gradskom zelenilu</h2>
      <div className="lessons">
        {LESSONS.map(l => (
          <details key={l.id} className="lesson" onToggle={e => (e.currentTarget as HTMLDetailsElement).open && markRead(l.id)}>
            <summary>
              {read.has(l.id) ? '✓ ' : ''}
              {l.title}
            </summary>
            <p>{l.body}</p>
          </details>
        ))}
      </div>

      <h2>Korišteni skupovi podataka</h2>
      <ul className="source-list">
        {Object.values(SOURCES).map(s => (
          <li key={s.id}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.name}
            </a>
            <span>
              {s.publisher} · {s.license} · {s.referenceDate}
            </span>
            <span className="muted">{s.usedFor}</span>
          </li>
        ))}
      </ul>
      {report && (
        <p className="muted small">
          <Badge kind="izvedeno" /> Podaci obrađeni {new Date(report.built_at).toLocaleDateString('hr-HR')}; popravljeno{' '}
          {report.vegetacija.invalid_repaired} neispravnih i uklonjeno {report.vegetacija.missing_or_empty_dropped} praznih geometrija
          vegetacije od {fmtInt(report.vegetacija.features_in)}.
        </p>
      )}
      <SourceNote ids={['vegetacija', 'namjena', 'vrtovi']} />
    </Panel>
  );
}
