import { useEffect, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContext, ZAGREB_CENTER, type MapCtx } from './mapContext';

export default function MapCanvas({ children }: { children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<MapCtx | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const m = L.map(containerRef.current, {
      center: ZAGREB_CENTER,
      zoom: 13,
      minZoom: 10,
      maxZoom: 19,
      zoomControl: false,
      preferCanvas: true,
      maxBounds: [
        [45.55, 15.6],
        [46.05, 16.4],
      ],
    });
    L.control.zoom({ position: 'topright' }).addTo(m);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(m);
    // Standard OSM tiles (desaturated via CSS so thematic layers stand out).
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'basemap-tiles',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> suradnici (ODbL) · Podaci: Grad Zagreb (data.gov.hr)',
    }).addTo(m);
    m.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    const clickListeners = new Set<(ll: L.LatLng) => void>();
    m.on('click', e => clickListeners.forEach(fn => fn(e.latlng)));
    setCtx({ map: m, clickListeners });
    return () => {
      m.remove();
      setCtx(null);
    };
  }, []);

  return (
    <MapContext.Provider value={ctx}>
      <div className="map-canvas" ref={containerRef} />
      {ctx && children}
    </MapContext.Provider>
  );
}
