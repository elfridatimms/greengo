import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { Panel, Badge, SourceNote } from './ui';
import { fitPadding, useMap, useMapClick } from './mapContext';
import { useMapLayer } from './useMapLayer';
import { loadGraph } from '../lib/data';
import { edgeLatLngs, nearestNode, type Graph } from '../lib/graph';
import { compareRoutes, explainComparison, NEAR_VEG_THRESHOLD, type RouteComparison } from '../lib/routing';
import { fmtKm, haversine, pct } from '../lib/geo';
import { logRoute } from '../lib/storage';
import { reward } from '../lib/gamification';

type Pt = { lat: number; lng: number };

const PRESETS: { name: string; a: Pt; b: Pt }[] = [
  { name: 'Glavni kolodvor → Park Maksimir', a: { lat: 45.8045, lng: 15.9785 }, b: { lat: 45.8222, lng: 16.0179 } },
  { name: 'Trg bana Jelačića → Bundek', a: { lat: 45.8131, lng: 15.9772 }, b: { lat: 45.7905, lng: 15.9925 } },
  { name: 'Britanski trg → Trg Republike Hrvatske', a: { lat: 45.8132, lng: 15.9625 }, b: { lat: 45.8087, lng: 15.9703 } },
  { name: 'Studentski centar → Gornji grad', a: { lat: 45.8025, lng: 15.9652 }, b: { lat: 45.8160, lng: 15.9733 } },
];

const MAX_SNAP_M = 250;


interface Props {
  onReward: (msg: string) => void;
}

const pinIcon = (label: string, cls: string) =>
  L.divIcon({ className: `route-pin ${cls}`, html: `<span>${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });

function greenColor(s: number) {
  if (s >= 0.6) return '#1b7a3a';
  if (s >= NEAR_VEG_THRESHOLD) return '#5cb85c';
  if (s >= 0.1) return '#c9d86a';
  return '#d9534f';
}

export default function RoutesView({ onReward }: Props) {
  const map = useMap();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  // [A] after the first click, [A, B] after the second; a third click starts over.
  const [pts, setPts] = useState<Pt[]>([]);
  const start = pts[0] ?? null;
  const end = pts[1] ?? null;
  const [preference, setPreference] = useState(0.6);
  const [maxDetour, setMaxDetour] = useState(0.25);
  const [showScores, setShowScores] = useState(false);
  const [viewTick, setViewTick] = useState(0);

  useEffect(() => {
    loadGraph().then(setGraph, e => setError(String(e.message ?? e)));
  }, []);

  useMapClick(ll => {
    const p = { lat: ll.lat, lng: ll.lng };
    setPts(prev => (prev.length === 1 ? [prev[0], p] : [p]));
  });

  useEffect(() => {
    if (!map) return;
    const h = () => setViewTick(t => t + 1);
    map.on('moveend', h);
    return () => {
      map.off('moveend', h);
    };
  }, [map]);

  const snap = useMemo(() => {
    if (!graph) return { s: -1, t: -1, err: null as string | null };
    const one = (p: Pt | null) => {
      if (!p) return -1;
      const n = nearestNode(graph, p.lng, p.lat);
      if (n < 0 || haversine(p.lng, p.lat, graph.lon[n], graph.lat[n]) > MAX_SNAP_M) return -2;
      return n;
    };
    const s = one(start);
    const t = one(end);
    const err = s === -2 || t === -2 ? 'Točka je izvan područja pješačke mreže (središnji Zagreb) ili predaleko od puta.' : null;
    return { s, t, err };
  }, [graph, start, end]);

  const result: RouteComparison | null = useMemo(() => {
    if (!graph || snap.s < 0 || snap.t < 0) return null;
    return compareRoutes(graph, snap.s, snap.t, { preference, maxDetour });
  }, [graph, snap, preference, maxDetour]);

  useEffect(() => {
    if (!result || result.sameRoute) return;
    logRoute({
      t: Date.now(),
      shortestM: result.shortest.stats.lengthM,
      greenM: result.green.stats.lengthM,
      shortestNear: result.shortest.stats.shareNearVeg,
      greenNear: result.green.stats.shareNearVeg,
    });
    const r = reward('greenRoute', 'first-green-route');
    onReward(`+${r.points} bodova${r.achievement ? ` · ${r.achievement.title}` : ''}`);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  useMapLayer(
    () => {
      const g = L.featureGroup();
      if (graph) {
        const [w, s, e, n] = graph.meta.bbox;
        L.rectangle([[s, w], [n, e]], { color: '#1f6b3d', weight: 1.5, dashArray: '6 6', fill: false, interactive: false })
          .bindTooltip('Područje pješačke mreže')
          .addTo(g);
      }
      if (result) {
        L.polyline(result.shortest.latlngs, { color: '#5b6770', weight: 5, opacity: 0.8, dashArray: '8 8' })
          .bindTooltip('Najkraća ruta')
          .addTo(g);
        if (!result.sameRoute) {
          L.polyline(result.green.latlngs, { color: '#ffffff', weight: 9, opacity: 0.9 }).addTo(g);
          L.polyline(result.green.latlngs, { color: '#1f8a4c', weight: 6, opacity: 0.95 }).bindTooltip('Zelenija ruta').addTo(g);
        }
      }
      if (start) L.marker([start.lat, start.lng], { icon: pinIcon('A', 'route-pin--a') }).addTo(g);
      if (end) L.marker([end.lat, end.lng], { icon: pinIcon('B', 'route-pin--b') }).addTo(g);
      return g;
    },
    true,
    [graph, result, start, end],
  );

  useEffect(() => {
    if (result && map) map.fitBounds(L.latLngBounds([...result.shortest.latlngs, ...result.green.latlngs]), fitPadding());
  }, [result?.shortest, map]); // eslint-disable-line react-hooks/exhaustive-deps

  useMapLayer(
    () => {
      if (!graph || !map || map.getZoom() < 15) return null;
      const b = map.getBounds().pad(0.1);
      const renderer = L.canvas();
      const g = L.layerGroup();
      for (let e = 0; e < graph.elen.length; e++) {
        const u = graph.eu[e];
        if (!b.contains([graph.lat[u], graph.lon[u]])) continue;
        L.polyline(edgeLatLngs(graph, e, u), {
          renderer,
          color: greenColor(graph.egreen[e]),
          weight: 3,
          opacity: 0.85,
          interactive: false,
        }).addTo(g);
      }
      return g;
    },
    showScores,
    [graph, viewTick],
  );

  const pickPreset = (p: (typeof PRESETS)[number]) => {
    setPts([p.a, p.b]);
  };

  const s = result?.shortest.stats;
  const gr = result?.green.stats;

  return (
    <Panel title="Zelene pješačke rute" subtitle="Kliknite na karti polazište (A) i odredište (B) ili odaberite primjer">
      {error && <p className="error">Graf pješačke mreže nije učitan: {error}</p>}
      {!graph && !error && <p className="muted">Učitavanje pješačke mreže (≈4 MB)…</p>}

      <div className="preset-list">
        {PRESETS.map(p => (
          <button key={p.name} type="button" className="chip" onClick={() => pickPreset(p)}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="control">
        <label htmlFor="pref">
          Preferencija: <strong>{preference === 0 ? 'najkraće' : preference >= 0.99 ? 'najzelenije' : `${Math.round(preference * 100)} % zelenilo`}</strong>
        </label>
        <input id="pref" type="range" min={0} max={1} step={0.05} value={preference} onChange={e => setPreference(Number(e.target.value))} />
        <div className="range-ends">
          <span>Najkraće</span>
          <span>Najzelenije</span>
        </div>
      </div>
      <div className="control">
        <label htmlFor="detour">Maksimalno produljenje rute</label>
        <select id="detour" value={maxDetour} onChange={e => setMaxDetour(Number(e.target.value))}>
          {[0.1, 0.2, 0.25, 0.35, 0.5].map(v => (
            <option key={v} value={v}>
              +{Math.round(v * 100)} %
            </option>
          ))}
        </select>
      </div>
      <label className="layer-item">
        <input type="checkbox" checked={showScores} onChange={() => setShowScores(v => !v)} /> Prikaži ocjenu zelenila mreže (zum ≥ 15)
      </label>

      {snap.err && <p className="error">{snap.err}</p>}
      {start && !end && <p className="muted">Odaberite odredište (B) na karti.</p>}

      {result && s && gr && (
        <>
          <table className="compare">
            <thead>
              <tr>
                <th />
                <th>Najkraća</th>
                <th className="green">Zelenija</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Duljina</td>
                <td>{fmtKm(s.lengthM)}</td>
                <td>{fmtKm(gr.lengthM)}</td>
              </tr>
              <tr>
                <td>Hod (4,8 km/h)</td>
                <td>{Math.round(s.minutes)} min</td>
                <td>{Math.round(gr.minutes)} min</td>
              </tr>
              <tr>
                <td>Duljina uz vegetaciju*</td>
                <td>{pct(s.shareNearVeg)}</td>
                <td>{pct(gr.shareNearVeg)}</td>
              </tr>
              <tr>
                <td>Prosj. ocjena zelenila</td>
                <td>{pct(s.meanGreen)}</td>
                <td>{pct(gr.meanGreen)}</td>
              </tr>
            </tbody>
          </table>
          <div className="explain">
            <h3>Zašto ova ruta?</h3>
            <ul>
              {explainComparison(result).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <p className="small muted">
              Korištena težina zelenila: {result.usedWeight.toFixed(2).replace('.', ',')} (trošak = duljina × (1 + težina × (1 − ocjena
              zelenila))).
            </p>
          </div>
        </>
      )}

      <div className="disclaimer">
        <Badge kind="izvedeno" /> *Ocjena zelenila = udio pojasa od ±{graph?.meta.buffer_m ?? 20} m oko segmenta puta koji je pod mapiranom
        vegetacijom (park, šuma, šikara, livada, voćnjak). "Uz vegetaciju" = segmenti s ocjenom ≥ {Math.round(NEAR_VEG_THRESHOLD * 100)} %. To je
        prostorni pokazatelj blizine zelenila, <strong>ne mjerenje hlada, temperature ili kvalitete zraka</strong>. Rutiranje pokriva središnji
        Zagreb.
      </div>
      <SourceNote ids={['osm', 'vegetacija']} />
    </Panel>
  );
}
