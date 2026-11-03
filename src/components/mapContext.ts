import { createContext, useContext, useEffect, useRef } from 'react';
import type L from 'leaflet';

/** Trg bana Josipa Jelačića, Zagreb. */
export const ZAGREB_CENTER: L.LatLngTuple = [45.8131, 15.9772];

export interface MapCtx {
  map: L.Map;
  clickListeners: Set<(ll: L.LatLng) => void>;
}

export const MapContext = createContext<MapCtx | null>(null);
export const useMap = () => useContext(MapContext)?.map ?? null;

/** Subscribe to map clicks while the calling component is mounted. */
export function useMapClick(handler: (ll: L.LatLng) => void) {
  const ctx = useContext(MapContext);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  }, [handler]);
  useEffect(() => {
    if (!ctx) return;
    const fn = (ll: L.LatLng) => ref.current(ll);
    ctx.clickListeners.add(fn);
    return () => {
      ctx.clickListeners.delete(fn);
    };
  }, [ctx]);
}

/** Keep fitted bounds clear of the side panel (desktop) or bottom sheet (mobile). */
export const fitPadding = (): L.FitBoundsOptions =>
  window.innerWidth > 760
    ? { paddingTopLeft: [450, 40], paddingBottomRight: [40, 40] }
    : { paddingTopLeft: [20, 60], paddingBottomRight: [20, window.innerHeight * 0.55] };
