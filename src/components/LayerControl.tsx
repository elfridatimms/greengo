import { useState } from 'react';
import { Layers } from 'lucide-react';
import { LAYER_LABELS, type LayerKey, type LayerState } from './layers';
import { VEG_COLORS, LULC_LABELS } from '../data/sources';

interface Props {
  layers: LayerState;
  onToggle: (k: LayerKey) => void;
  defaultOpen: boolean;
}

export default function LayerControl({ layers, onToggle, defaultOpen }: Props) {
  const [open, setOpen] = useState(() => defaultOpen && window.innerWidth > 900);
  return (
    <div className={`layer-control${open ? ' is-open' : ''}`}>
      <button type="button" className="layer-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Layers size={18} /> Slojevi
      </button>
      {open && (
        <div className="layer-body">
          {(Object.keys(LAYER_LABELS) as LayerKey[]).map(k => (
            <label key={k} className="layer-item">
              <input type="checkbox" checked={layers[k]} onChange={() => onToggle(k)} />
              {LAYER_LABELS[k]}
            </label>
          ))}
          {layers.vegetation && (
            <div className="legend">
              <div className="legend-title">Vegetacija (Topografska osnova 2018)</div>
              {Object.entries(VEG_COLORS).map(([code, color]) => (
                <div key={code} className="legend-row">
                  <span className="legend-swatch" style={{ background: color }} />
                  {LULC_LABELS[Number(code)]}
                </div>
              ))}
              <div className="legend-note">Od zuma 14 prikazuje se detaljni sloj za središnji Zagreb.</div>
            </div>
          )}
          {layers.gardens && (
            <div className="legend-row">
              <span className="legend-swatch" style={{ background: '#e08a4c' }} /> Gradski vrt
            </div>
          )}
        </div>
      )}
    </div>
  );
}
