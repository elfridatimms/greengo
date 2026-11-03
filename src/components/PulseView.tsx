import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { Panel, Kpi, Bar, SourceNote, Badge } from './ui';
import { useMapLayer, escapeHtml } from './useMapLayer';
import { fitPadding, useMap } from './mapContext';
import { loadGeoJson, loadGrid, loadReport, type FeatureCollection, type PipelineReport } from '../lib/data';
import { fmtInt, pct } from '../lib/geo';
import type { Grid } from '../lib/greenplan';
import { DEFAULT_PARAMS, LOW_GREEN } from '../lib/greenplan';
import { getReports, getRouteLog } from '../lib/storage';
import { LULC_LABELS, VEG_COLORS } from '../data/sources';
import { REPORT_CATEGORIES } from '../data/reportCategories';

interface DistrictProps {
  name: string;
  area_km2: number;
  green_share: number;
  park_share: number;
  forest_share: number;
  built_share: number;
  class_shares: Record<string, number>;
  residential_km2: number;
  residential_near_garden_share: number;
  gardens: number;
  garden_plots: number;
}

const CHORO = ['#f3e6c4', '#d9e8b0', '#a9d18e', '#6fb36b', '#2f7d32'];
const choroColor = (g: number) => CHORO[Math.min(CHORO.length - 1, Math.floor(g / 0.2))];

const CLASS_GROUPS: { label: string; codes: number[]; color: string }[] = [
  { label: 'Šuma i šikara', codes: [6, 7], color: VEG_COLORS[6] },
  { label: 'Park', codes: [5], color: VEG_COLORS[5] },
  { label: 'Livade, voćnjaci, vinogradi', codes: [2, 3], color: VEG_COLORS[2] },
  { label: 'Oranice', codes: [1], color: '#ead27a' },
  { label: 'Dvorišta', codes: [12], color: '#f4efc0' },
  { label: 'Zgrade i izgrađene površine', codes: [9, 10, 11, 13, 15, 16], color: '#a9a3b8' },
  { label: 'Ostalo (groblja, neplodno, neobradivo)', codes: [4, 8, 14], color: '#cfcfcf' },
];

export default function PulseView({ onError }: { onError: (e: Error) => void }) {
  const [districts, setDistricts] = useState<FeatureCollection | null>(null);
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    loadGeoJson('districts.geojson').then(setDistricts, onError);
    loadReport().then(setReport, onError);
    loadGrid().then(setGrid, onError);
  }, [onError]);

  const map = useMap();
  useEffect(() => {
    if (map && districts) map.fitBounds(L.geoJSON(districts).getBounds(), fitPadding());
  }, [map, districts]);

  const rows = useMemo(
    () =>
      (districts?.features ?? [])
        .map(f => f.properties as DistrictProps)
        .sort((a, b) => a.green_share - b.green_share),
    [districts],
  );

  const lowGreenByDistrict = useMemo(() => {
    const m = new Map<string, number>();
    if (!grid) return m;
    for (const c of grid.cells) {
      if (c.res >= 0.5 && c.built >= DEFAULT_PARAMS.minBuilt && c.green < LOW_GREEN) m.set(c.district, (m.get(c.district) ?? 0) + 1);
    }
    return m;
  }, [grid]);

  useMapLayer(
    () =>
      districts &&
      L.geoJSON(districts, {
        style: f => ({
          color: f?.properties?.name === selected ? '#0f3d23' : '#ffffff',
          weight: f?.properties?.name === selected ? 3 : 1.2,
          fillColor: choroColor(f?.properties?.green_share ?? 0),
          fillOpacity: 0.72,
        }),
        onEachFeature: (f, l) => {
          l.bindTooltip(`${escapeHtml(f.properties?.name)}: ${pct(f.properties?.green_share ?? 0)} vegetacije`, { sticky: true });
          l.on('click', () => setSelected(f.properties?.name));
        },
      }),
    true,
    [districts, selected],
  );

  const reports = getReports();
  const routeLog = getRouteLog();
  const sel = rows.find(r => r.name === selected) ?? null;
  const city = report?.city;

  return (
    <Panel wide title="Zagreb GreenPulse" subtitle="Okolišni pokazatelji izračunati iz otvorenih podataka Grada Zagreba">
      {city && (
        <div className="kpi-grid">
          <Kpi label="Udio mapirane vegetacije (grad)" value={pct(city.green_share, 1)} kind="izvedeno" />
          <Kpi label="Parkovi (šifra 5100E)" value={`${city.class_area_km2['5'].toFixed(1).replace('.', ',')} km²`} kind="izmjereno" />
          <Kpi
            label="Stambene površine ≤ 1 km od gradskog vrta"
            value={pct(city.residential_near_garden_share, 1)}
            kind="izvedeno"
            hint="Zračna udaljenost od granice vrta"
          />
          <Kpi label="Gradski vrtovi / parcele" value={`${city.gardens} / ${fmtInt(city.garden_plots)}`} kind="izmjereno" />
        </div>
      )}

      <h2>Mapirana vegetacija po gradskim četvrtima</h2>
      <p className="small muted">Kliknite četvrt na karti ili u popisu. Poredano od najmanjeg udjela.</p>
      <div className="bars">
        {rows.map(r => (
          <button type="button" key={r.name} className={`bar-btn${selected === r.name ? ' is-sel' : ''}`} onClick={() => setSelected(r.name)}>
            <Bar label={r.name} value={r.green_share} color={choroColor(r.green_share)} right={pct(r.green_share)} />
          </button>
        ))}
      </div>
      <div className="choro-legend">
        {CHORO.map((c, i) => (
          <span key={c}>
            <i style={{ background: c }} />
            {i * 20}–{(i + 1) * 20} %
          </span>
        ))}
      </div>

      {sel && (
        <div className="district-card">
          <h3>{sel.name}</h3>
          <p className="small muted">{sel.area_km2.toFixed(1).replace('.', ',')} km² · <Badge kind="izvedeno" /></p>
          <div className="stack">
            {CLASS_GROUPS.map(g => {
              const v = g.codes.reduce((s, c) => s + (sel.class_shares[String(c)] ?? 0), 0);
              return v > 0 ? <span key={g.label} style={{ width: `${v * 100}%`, background: g.color }} title={`${g.label}: ${pct(v, 1)}`} /> : null;
            })}
          </div>
          <div className="stack-legend">
            {CLASS_GROUPS.map(g => {
              const v = g.codes.reduce((s, c) => s + (sel.class_shares[String(c)] ?? 0), 0);
              return (
                <span key={g.label}>
                  <i style={{ background: g.color }} />
                  {g.label} {pct(v, 1)}
                </span>
              );
            })}
          </div>
          <dl className="facts">
            <dt>Planirana stambena/mješovita namjena</dt>
            <dd>{sel.residential_km2.toFixed(2).replace('.', ',')} km²</dd>
            <dt>…od toga ≤ 1 km od gradskog vrta</dt>
            <dd>{pct(sel.residential_near_garden_share)}</dd>
            <dt>Gradski vrtovi (parcele)</dt>
            <dd>
              {sel.gardens} ({fmtInt(sel.garden_plots)})
            </dd>
            <dt>Stambene ćelije 250 m s &lt; {LOW_GREEN * 100} % vegetacije</dt>
            <dd>{lowGreenByDistrict.get(sel.name) ?? 0}</dd>
          </dl>
        </div>
      )}

      <h2>Područja s ograničenom mapiranom vegetacijom</h2>
      <p className="small muted">
        Broj ćelija 250 × 250 m s ≥ 50 % stambene/mješovite planirane namjene, ≥ {DEFAULT_PARAMS.minBuilt * 100} % izgrađenih površina i &lt; {LOW_GREEN * 100} % mapirane vegetacije.{' '}
        <Badge kind="izvedeno" />
      </p>
      <div className="bars">
        {[...lowGreenByDistrict.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, n], _i, arr) => (
            <Bar key={name} label={name} value={n} max={arr[0]?.[1] ?? 1} color="#d98c5f" right={String(n)} />
          ))}
      </div>

      <h2>Struktura pokrova zemljišta — cijeli grad</h2>
      {city && (
        <div className="bars">
          {CLASS_GROUPS.map(g => {
            const km2 = g.codes.reduce((s, c) => s + (city.class_area_km2[String(c)] ?? 0), 0);
            return <Bar key={g.label} label={g.label} value={km2} max={city.mapped_area_km2 / 2} color={g.color} right={`${km2.toFixed(1).replace('.', ',')} km²`} />;
          })}
        </div>
      )}
      <p className="small muted">
        Klase prema šifrarniku izdavatelja: {Object.values(LULC_LABELS).slice(0, 4).join(', ')}…
      </p>

      <h2>Zelene rute i prijave</h2>
      <div className="kpi-grid">
        {report && (
          <Kpi
            label="Prosječna ocjena zelenila pješačke mreže (središte)"
            value={pct(report.graph.length_weighted_green_score)}
            kind="izvedeno"
            hint={`${fmtInt(report.graph.edges)} segmenata, buffer ${report.params.buffer} m`}
          />
        )}
        <Kpi label="Izračunatih zelenih ruta na ovom uređaju" value={routeLog.length} kind="demo" />
        <Kpi label="Prijava na ovom uređaju" value={reports.length} kind="demo" />
      </div>
      {reports.length > 0 && (
        <div className="bars">
          {REPORT_CATEGORIES.map(c => {
            const n = reports.filter(r => r.category === c.id).length;
            return <Bar key={c.id} label={`${c.emoji} ${c.label}`} value={n} max={reports.length} color="#7b8fa3" right={String(n)} />;
          })}
        </div>
      )}
      <p className="small muted">
        Pokazatelji kvalitete zraka nisu prikazani: skup "Geoportal Kvaliteta zraka" sadrži samo lokacije mjernih postaja, ne i mjerenja.
      </p>
      <SourceNote ids={['vegetacija', 'namjena', 'vrtovi', 'cetvrti', 'osm']} />
    </Panel>
  );
}
