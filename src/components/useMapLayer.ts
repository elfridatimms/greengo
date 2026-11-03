import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from './mapContext';

/**
 * Mount a Leaflet layer created by `build` while `visible` is true.
 * `build` is re-run whenever `deps` change.
 */
export function useMapLayer(build: () => L.Layer | null, visible: boolean, deps: unknown[]) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!map || !visible) return;
    const layer = build();
    if (!layer) return;
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      layer.remove();
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, visible, ...deps]);

  return layerRef;
}

export const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
