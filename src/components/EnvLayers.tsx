import { useEffect, useState } from 'react';
import L from 'leaflet';
import { useMap } from './mapContext';
import type { LayerState } from './layers';
import { escapeHtml, useMapLayer } from './useMapLayer';
import { loadGeoJson, type FeatureCollection } from '../lib/data';
import { LANDUSE_COLORS, LULC_LABELS, VEG_COLORS } from '../data/sources';
import type { EnvReport } from '../lib/storage';
import { REPORT_CATEGORIES } from '../data/reportCategories';

function useGeo(file: string, enabled: boolean, onError: (e: Error) => void) {
  const [fc, setFc] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    if (!enabled || fc) return;
    let alive = true;
    loadGeoJson(file).then(d => alive && setFc(d), e => alive && onError(e));
    return () => {
      alive = false;
    };
  }, [file, enabled, fc, onError]);
  return fc;
}

function useZoom() {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map?.getZoom() ?? 13);
  useEffect(() => {
    if (!map) return;
    const h = () => setZoom(map.getZoom());
    map.on('zoomend', h);
    return () => {
      map.off('zoomend', h);
    };
  }, [map]);
  return zoom;
}

const vegStyle = (f?: GeoJSON.Feature): L.PathOptions => ({
  stroke: false,
  fillColor: VEG_COLORS[f?.properties?.code as number] ?? '#6aa84f',
  fillOpacity: 0.55,
});

interface Props {
  layers: LayerState;
  reports: EnvReport[];
  onError: (e: Error) => void;
  onGardenOpen?: () => void;
}

export default function EnvLayers({ layers, reports, onError, onGardenOpen }: Props) {
  const zoom = useZoom();
  const detailed = zoom >= 14;
  const vegCity = useGeo('veg_city.geojson', layers.vegetation && !detailed, onError);
  const vegStudy = useGeo('veg_study.geojson', layers.vegetation && detailed, onError);
  const landuse = useGeo('landuse.geojson', layers.landuse, onError);
  const gardens = useGeo('gardens.geojson', layers.gardens, onError);
  const air = useGeo('air_stations.geojson', layers.air, onError);
  const districts = useGeo('districts.geojson', layers.districts, onError);

  useMapLayer(
    () =>
      landuse &&
      L.geoJSON(landuse, {
        style: f => ({
          stroke: false,
          fillColor: LANDUSE_COLORS[f?.properties?.group] ?? '#cccccc',
          fillOpacity: 0.35,
        }),
        onEachFeature: (f, l) => l.bindTooltip(escapeHtml(f.properties?.group), { sticky: true }),
      }),
    layers.landuse,
    [landuse],
  );

  useMapLayer(
    () => {
      const fc = detailed ? vegStudy : vegCity;
      return (
        fc &&
        L.geoJSON(fc, {
          style: vegStyle,
          onEachFeature: (f, l) => l.bindTooltip(LULC_LABELS[f.properties?.code] ?? '', { sticky: true }),
        })
      );
    },
    layers.vegetation,
    [detailed, vegCity, vegStudy],
  );

  useMapLayer(
    () =>
      districts &&
      L.geoJSON(districts, {
        style: { color: '#24543a', weight: 1.5, fill: false, dashArray: '4 4' },
        interactive: false,
      }),
    layers.districts,
    [districts],
  );

  useMapLayer(
    () => {
      if (!gardens) return null;
      const group = L.featureGroup();
      L.geoJSON(gardens, {
        style: { color: '#b4572a', weight: 2, fillColor: '#e08a4c', fillOpacity: 0.6 },
        onEachFeature: (f, layer) => {
          const p = f.properties ?? {};
          const html = `<strong>${escapeHtml(p.naziv)}</strong><br>${escapeHtml(p.adresa)}<br>${escapeHtml(
            p.grad_cetvrt,
          )}<br>Vrtnih parcela: <b>${escapeHtml(p.br_vr_parcela ?? '—')}</b> · otvoren ${escapeHtml(
            p.godina_otvaranja ?? '—',
          )}<br><small>Izvor: Geoportal gradski vrt (CC BY 4.0)</small>`;
          layer.bindPopup(html);
          layer.on('popupopen', () => onGardenOpen?.());
          const center = (layer as L.Polygon).getBounds().getCenter();
          const marker = L.marker(center, {
            icon: L.divIcon({ className: 'garden-pin', html: '<span>🥕</span>', iconSize: [28, 28] }),
          }).bindPopup(html);
          marker.on('popupopen', () => onGardenOpen?.());
          group.addLayer(marker);
        },
      }).addTo(group);
      return group;
    },
    layers.gardens,
    [gardens],
  );

  useMapLayer(
    () =>
      air &&
      L.geoJSON(air, {
        pointToLayer: (_f, ll) =>
          L.marker(ll, { icon: L.divIcon({ className: 'air-pin', html: '<span>◎</span>', iconSize: [26, 26] }) }),
        onEachFeature: (f, l) => {
          const p = f.properties ?? {};
          l.bindPopup(
            `<strong>Mjerna postaja: ${escapeHtml(p.naziv)}</strong><br>${escapeHtml(p.tip_podrucja)} · ${escapeHtml(
              p.tip_postaje,
            )}<br><small>Mjeri: ${escapeHtml(p.mjerne_tvari)}</small><br><em>Prikazana je samo lokacija postaje — mjerenja nisu uključena.</em>`,
          );
        },
      }),
    layers.air,
    [air],
  );

  useMapLayer(
    () => {
      if (!reports.length) return null;
      const g = L.layerGroup();
      for (const r of reports) {
        const cat = REPORT_CATEGORIES.find(c => c.id === r.category);
        L.marker([r.lat, r.lng], {
          icon: L.divIcon({ className: 'report-pin', html: `<span>${cat?.emoji ?? '!'}</span>`, iconSize: [28, 28] }),
        })
          .bindPopup(
            `<strong>${escapeHtml(cat?.label)}</strong><br>${escapeHtml(r.description)}<br><small>${new Date(
              r.timestamp,
            ).toLocaleString('hr-HR')} · status: ${escapeHtml(r.status)}</small><br><em>Lokalni demo — nije proslijeđeno Gradu.</em>`,
          )
          .addTo(g);
      }
      return g;
    },
    layers.reports,
    [reports],
  );

  return null;
}
