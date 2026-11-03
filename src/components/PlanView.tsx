import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { Panel, Badge, Bar, SourceNote } from './ui';
import { useMapLayer } from './useMapLayer';
import { fitPadding, useMap } from './mapContext';
import { loadGrid } from '../lib/data';
import { fmtInt, pct } from '../lib/geo';
import {
  DEFAULT_PARAMS,
  FACTOR_LABELS,
  GARDEN_WEIGHTS,
  TREE_WEIGHTS,
  scoreCells,
  simulateConnectivity,
  simulateGardens,
  simulateTrees,
  type FactorKey,
  type Grid,
  type ScoredCell,
  type Cell,
  type ConnectivityScenario,
  type GardenScenario,
  type TreeScenario,
} from '../lib/greenplan';
import { unlockOnly } from '../lib/gamification';

type Mode = 'trees' | 'gardens' | 'connectivity';

const MODES: { id: Mode; label: string }[] = [
  { id: 'trees', label: 'Sadnja drveća' },
  { id: 'gardens', label: 'Novi gradski vrtovi' },
  { id: 'connectivity', label: 'Zelena povezanost' },
];

const RAMP = ['#fff5d6', '#fdd49e', '#fc8d59', '#e34a33', '#b30000'];
const rampColor = (s: number) => RAMP[Math.min(RAMP.length - 1, Math.floor(s * RAMP.length))];

export default function PlanView({ onError, onReward }: { onError: (e: Error) => void; onReward: (m: string) => void }) {
  const map = useMap();
  const [grid, setGrid] = useState<Grid | null>(null);
  const [mode, setMode] = useState<Mode>('trees');
  const [selected, setSelected] = useState<ScoredCell | null>(null);
  const [conversion, setConversion] = useState(0.25);
  const [garden, setGarden] = useState<GardenScenario | null>(null);
  const [trees, setTrees] = useState<TreeScenario | null>(null);
  const [conn, setConn] = useState<ConnectivityScenario | null>(null);

  useEffect(() => {
    loadGrid().then(setGrid, onError);
  }, [onError]);

  const weights = mode === 'gardens' ? GARDEN_WEIGHTS : TREE_WEIGHTS;
  const scored = useMemo(() => (grid ? scoreCells(grid, weights) : []), [grid, weights]);

  const picks: Cell[] = useMemo(() => {
    if (mode === 'gardens') return garden?.picks.map(p => p.cell) ?? [];
    if (mode === 'trees') return trees?.picks.map(p => p.cell) ?? [];
    return conn?.picks ?? [];
  }, [mode, garden, trees, conn]);

  useMapLayer(
    () => {
      if (!grid) return null;
      const renderer = L.canvas({ padding: 0.3 });
      const g = L.featureGroup();
      if (mode === 'connectivity') {
        for (const c of grid.cells) {
          if (c.green < DEFAULT_PARAMS.greenCellThreshold) continue;
          L.rectangle([[c.bounds[0], c.bounds[1]], [c.bounds[2], c.bounds[3]]], {
            renderer, stroke: false, fillColor: '#4f9d58', fillOpacity: 0.45, interactive: false,
          }).addTo(g);
        }
      } else {
        for (const s of scored) {
          const b = s.cell.bounds;
          L.rectangle([[b[0], b[1]], [b[2], b[3]]], {
            renderer, stroke: false, fillColor: rampColor(s.score), fillOpacity: 0.62,
          })
            .on('click', () => setSelected(s))
            .addTo(g);
        }
      }
      for (const c of picks) {
        const b = c.bounds;
        L.rectangle([[b[0], b[1]], [b[2], b[3]]], { renderer, color: '#0b3d91', weight: 3, fill: false, interactive: false }).addTo(g);
      }
      return g;
    },
    true,
    [grid, scored, mode, picks],
  );

  useMapLayer(
    () => {
      if (!selected) return null;
      const b = selected.cell.bounds;
      return L.rectangle([[b[0], b[1]], [b[2], b[3]]], { color: '#111', weight: 2, fill: false, interactive: false });
    },
    true,
    [selected],
  );

  const run = () => {
    if (!grid) return;
    if (mode === 'gardens') setGarden(simulateGardens(grid, 5));
    if (mode === 'trees') setTrees(simulateTrees(grid, 10, conversion));
    if (mode === 'connectivity') setConn(simulateConnectivity(grid, 10));
    const a = unlockOnly('planner');
    if (a) onReward(`Postignuće: ${a.title}`);
  };


  const cellKm2 = grid ? (grid.cellM * grid.cellM) / 1e6 : 0;
  const focus = (c: Cell) => map?.fitBounds([[c.bounds[0], c.bounds[1]], [c.bounds[2], c.bounds[3]]], { ...fitPadding(), maxZoom: 16 });

  const pickList = (list: ScoredCell[]) => (
    <ol className="pick-list">
      {list.map(p => (
        <li key={p.cell.idx}>
          <button type="button" className="link" onClick={() => { setSelected(p); focus(p.cell); }}>
            {p.cell.district} — ocjena {Math.round(p.score * 100)}
          </button>
          <span className="small muted"> · vegetacija {pct(p.cell.green)}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <Panel title="GreenPlan" subtitle="Podrška odlučivanju: gdje provjeriti mogućnosti ozelenjavanja">
      <div className="segmented">
        {MODES.map(m => (
          <button key={m.id} type="button" className={mode === m.id ? 'is-active' : ''} onClick={() => { setMode(m.id); setSelected(null); }}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="warning">
        Kandidatske lokacije su rezultat prostornog modela i <strong>zahtijevaju provjeru</strong> vlasništva, stanja tla, komunalne
        infrastrukture i prostorno-planskih ograničenja. Planirana namjena nije dozvola za sadnju ili gradnju.
      </div>

      {mode !== 'connectivity' && (
        <>
          <h2>Model ocjene (0–100)</h2>
          <div className="bars">
            {(Object.entries(weights) as [FactorKey, number][]).map(([k, w]) => (
              <Bar key={k} label={FACTOR_LABELS[k]} value={w} max={0.5} color="#2f7d32" right={`${Math.round(w * 100)} %`} />
            ))}
          </div>
          <p className="small muted">
            Uključene su ćelije 250 m s ≥ {DEFAULT_PARAMS.minResidential * 100} % stambene/mješovite namjene i &lt;{' '}
            {DEFAULT_PARAMS.maxExcluded * 100} % prometne, infrastrukturne, vodne, grobljanske ili posebne namjene te ≥{' '}
            {DEFAULT_PARAMS.minBuilt * 100} % postojećih izgrađenih površina ({fmtInt(scored.length)} ćelija). <Badge kind="izvedeno" />
          </p>
        </>
      )}
      {mode === 'connectivity' && (
        <p className="small">
          Zelene ćelije (≥ {DEFAULT_PARAMS.greenCellThreshold * 100} % mapirane vegetacije) prikazane su zeleno. Scenarij traži ćelije koje bi
          spojile najviše odvojenih zelenih cjelina (4-susjedstvo). <Badge kind="izvedeno" />
        </p>
      )}

      {selected && mode !== 'connectivity' && (
        <div className="district-card">
          <h3>Ćelija u četvrti {selected.cell.district}</h3>
          <p>
            Ocjena: <strong>{Math.round(selected.score * 100)}</strong> / 100
          </p>
          <div className="bars">
            {(Object.keys(weights) as FactorKey[]).map(k => (
              <Bar key={k} label={FACTOR_LABELS[k]} value={selected.factors[k]} color="#e34a33" right={pct(selected.factors[k])} />
            ))}
          </div>
          <dl className="facts">
            <dt>Mapirana vegetacija</dt><dd>{pct(selected.cell.green, 1)}</dd>
            <dt>Stambena/mješovita namjena</dt><dd>{pct(selected.cell.res)}</dd>
            <dt>Do parka/šume ≥ 1 ha</dt><dd>{fmtInt(selected.cell.dpark)} m</dd>
            <dt>Do gradskog vrta</dt><dd>{fmtInt(selected.cell.dgarden)} m</dd>
          </dl>
        </div>
      )}

      <h2>Simulator scenarija</h2>
      {mode === 'trees' && (
        <div className="control">
          <label htmlFor="conv">Pretpostavka: ozelenjeno {Math.round(conversion * 100)} % nezapečaćenih površina i dvorišta u odabranim ćelijama</label>
          <input id="conv" type="range" min={0} max={1} step={0.05} value={conversion} onChange={e => {
              const v = Number(e.target.value);
              setConversion(v);
              if (grid && trees) setTrees(simulateTrees(grid, 10, v));
            }} />
        </div>
      )}
      <button type="button" className="btn-primary" onClick={run} disabled={!grid}>
        {mode === 'gardens' && 'Dodaj 5 novih gradskih vrtova'}
        {mode === 'trees' && 'Odaberi 10 područja za procjenu sadnje'}
        {mode === 'connectivity' && 'Povećaj zelenu povezanost (10 ćelija)'}
      </button>

      {mode === 'gardens' && garden && (
        <div className="scenario">
          <Badge kind="procjena" />
          <table className="compare">
            <thead><tr><th /><th>Prije</th><th>Poslije</th></tr></thead>
            <tbody>
              <tr>
                <td>Stambene površine ≤ 1 km od vrta</td>
                <td>{garden.beforeKm2.toFixed(1).replace('.', ',')} km²</td>
                <td>{garden.afterKm2.toFixed(1).replace('.', ',')} km²</td>
              </tr>
              <tr>
                <td>Udio svih stambenih površina</td>
                <td>{pct(garden.beforeKm2 / garden.totalResidentialKm2, 1)}</td>
                <td>{pct(garden.afterKm2 / garden.totalResidentialKm2, 1)}</td>
              </tr>
            </tbody>
          </table>
          <p className="small muted">Ćelijska aproksimacija (središte ćelije) — vrijednost se može razlikovati od točnog izračuna u GreenPulseu.</p>
          {pickList(garden.picks)}
        </div>
      )}
      {mode === 'trees' && trees && (
        <div className="scenario">
          <Badge kind="procjena" />
          <table className="compare">
            <thead><tr><th /><th>Prije</th><th>Poslije*</th></tr></thead>
            <tbody>
              <tr>
                <td>Prosj. vegetacija u 10 odabranih ćelija</td>
                <td>{pct(trees.meanGreenPicksBefore, 1)}</td>
                <td>{pct(trees.meanGreenPicksAfter, 1)}</td>
              </tr>
              <tr>
                <td>Stambene ćelije s &lt; 10 % vegetacije</td>
                <td>{trees.lowGreenBefore}</td>
                <td>{trees.lowGreenAfter}</td>
              </tr>
            </tbody>
          </table>
          <p className="small muted">
            *Hipotetski izračun uz korisničku pretpostavku. Ne procjenjuje se učinak na temperaturu, onečišćenje, poplave ni bioraznolikost.
          </p>
          {pickList(trees.picks)}
        </div>
      )}
      {mode === 'connectivity' && conn && (
        <div className="scenario">
          <Badge kind="procjena" />
          <table className="compare">
            <thead><tr><th /><th>Prije</th><th>Poslije</th></tr></thead>
            <tbody>
              <tr><td>Odvojene zelene cjeline</td><td>{conn.before.components}</td><td>{conn.after.components}</td></tr>
              <tr><td>Izolirane male cjeline (≤ 2 ćelije)</td><td>{conn.before.smallPatches}</td><td>{conn.after.smallPatches}</td></tr>
              <tr><td>Najveća povezana cjelina</td><td>{fmtInt(conn.before.largestCells * cellKm2)} km²</td><td>{fmtInt(conn.after.largestCells * cellKm2)} km²</td></tr>
            </tbody>
          </table>
          <ol className="pick-list">
            {conn.picks.map(c => (
              <li key={c.idx}>
                <button type="button" className="link" onClick={() => focus(c)}>
                  {c.district} — vegetacija {pct(c.green)}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <SourceNote ids={['vegetacija', 'namjena', 'vrtovi', 'cetvrti']} extra="Pokazatelj dostupnosti parka prema WHO Europe (zelena površina ≥ 1 ha unutar 300 m)" />
    </Panel>
  );
}
