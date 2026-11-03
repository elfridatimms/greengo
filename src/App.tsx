import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Compass, Flag, Footprints, Sprout } from 'lucide-react';
import MapCanvas from './components/MapCanvas';
import EnvLayers from './components/EnvLayers';
import type { LayerKey, LayerState } from './components/layers';
import LayerControl from './components/LayerControl';
import ExploreView from './components/ExploreView';
import RoutesView from './components/RoutesView';
import PulseView from './components/PulseView';
import PlanView from './components/PlanView';
import ReportView from './components/ReportView';
import { getPoints, getReports, type EnvReport } from './lib/storage';
import { unlockOnly } from './lib/gamification';
import './styles/global.css';

type Tab = 'explore' | 'routes' | 'pulse' | 'plan' | 'report';

const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: 'explore', label: 'Istraži', icon: Compass },
  { id: 'routes', label: 'Rute', icon: Footprints },
  { id: 'pulse', label: 'GreenPulse', icon: BarChart3 },
  { id: 'plan', label: 'GreenPlan', icon: Sprout },
  { id: 'report', label: 'Prijavi', icon: Flag },
];

/** Default visible layers per tab; the user can change them with the layer control. */
const DEFAULT_LAYERS: Record<Tab, LayerState> = {
  explore: { vegetation: true, landuse: false, gardens: true, air: true, districts: true, reports: true },
  routes: { vegetation: true, landuse: false, gardens: false, air: false, districts: false, reports: false },
  pulse: { vegetation: false, landuse: false, gardens: true, air: false, districts: false, reports: false },
  plan: { vegetation: false, landuse: false, gardens: true, air: false, districts: true, reports: false },
  report: { vegetation: true, landuse: false, gardens: false, air: false, districts: false, reports: true },
};

const initialTab = (): Tab => {
  const h = window.location.hash.replace('#', '') as Tab;
  return TABS.some(t => t.id === h) ? h : 'explore';
};

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS[initialTab()]);
  const [reports, setReports] = useState<EnvReport[]>(() => getReports());
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState(() => getPoints());
  const [panelOpen, setPanelOpen] = useState(true);

  const switchTab = (t: Tab) => {
    setTab(t);
    setLayers(DEFAULT_LAYERS[t]);
    setPanelOpen(true);
    window.history.replaceState(null, '', `#${t}`);
  };

  useEffect(() => {
    const onHash = () => {
      const t = initialTab();
      setTab(t);
      setLayers(DEFAULT_LAYERS[t]);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const onReward = useCallback((msg: string) => {
    setToast(msg);
    setPoints(getPoints());
  }, []);

  const onError = useCallback((e: Error) => setError(`Podaci nisu učitani — ${e.message}`), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const toggleLayer = (k: LayerKey) => setLayers(l => ({ ...l, [k]: !l[k] }));
  const onGardenOpen = useCallback(() => {
    const a = unlockOnly('garden-explorer');
    if (a) onReward(`Postignuće: ${a.title}`);
  }, [onReward]);

  return (
    <div className={`app tab-${tab}`}>
      <nav className="nav">
        <div className="brand">
          <span className="brand-mark">🌿</span>
          <span>
            <strong>GreenGo</strong> Zagreb
          </span>
        </div>
        <div className="nav-tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => switchTab(id)}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <span className="points" title="Bodovi (lokalno)">
          🌱 {points}
        </span>
      </nav>

      <main className="stage">
        <MapCanvas>
          <EnvLayers layers={layers} reports={reports} onError={onError} onGardenOpen={onGardenOpen} />
          <LayerControl key={tab} layers={layers} onToggle={toggleLayer} defaultOpen={tab === 'explore'} />
          <div className={`panel-wrap${panelOpen ? '' : ' is-collapsed'}`}>
            <button type="button" className="panel-handle" onClick={() => setPanelOpen(o => !o)} aria-label="Prikaži/sakrij panel">
              {panelOpen ? '▾' : '▴'}
            </button>
            {tab === 'explore' && <ExploreView onNavigate={switchTab} onReward={onReward} />}
            {tab === 'routes' && <RoutesView onReward={onReward} />}
            {tab === 'pulse' && <PulseView onError={onError} />}
            {tab === 'plan' && <PlanView onError={onError} onReward={onReward} />}
            {tab === 'report' && <ReportView onChange={setReports} onReward={onReward} />}
          </div>
        </MapCanvas>
        {toast && <div className="toast">{toast}</div>}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="Zatvori">
              ×
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
