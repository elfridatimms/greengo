import { parseGraph, type Graph, type RawGraph } from './graph';
import { parseGrid, type Grid, type RawGrid } from './greenplan';

export type FeatureCollection = GeoJSON.FeatureCollection;

export class DataLoadError extends Error {
  readonly file: string;
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.file = file;
  }
}

const cache = new Map<string, Promise<unknown>>();

/** Fetch a JSON file from /data with caching and explicit error messages. */
export function loadJson<T>(file: string, fetcher: typeof fetch = fetch): Promise<T> {
  const hit = cache.get(file);
  if (hit) return hit as Promise<T>;
  const p = (async () => {
    let res: Response;
    try {
      res = await fetcher(`${import.meta.env?.BASE_URL ?? '/'}data/${file}`);
    } catch (e) {
      throw new DataLoadError(file, `mrežna pogreška (${(e as Error).message})`);
    }
    if (!res.ok) throw new DataLoadError(file, `HTTP ${res.status}`);
    try {
      return (await res.json()) as T;
    } catch {
      throw new DataLoadError(file, 'datoteka nije ispravan JSON');
    }
  })();
  cache.set(file, p);
  p.catch(() => cache.delete(file));
  return p;
}

export async function loadGeoJson(file: string, fetcher?: typeof fetch): Promise<FeatureCollection> {
  const fc = await loadJson<FeatureCollection>(file, fetcher);
  if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new DataLoadError(file, 'nije GeoJSON FeatureCollection');
  }
  // Drop features with missing geometry instead of failing the whole layer.
  return { ...fc, features: fc.features.filter(f => f && f.geometry) };
}

let graphPromise: Promise<Graph> | null = null;
export function loadGraph(): Promise<Graph> {
  graphPromise ??= loadJson<RawGraph>('graph.json').then(parseGraph);
  graphPromise.catch(() => (graphPromise = null));
  return graphPromise;
}

let gridPromise: Promise<Grid> | null = null;
export function loadGrid(): Promise<Grid> {
  gridPromise ??= loadJson<RawGrid>('grid.json').then(parseGrid);
  gridPromise.catch(() => (gridPromise = null));
  return gridPromise;
}

export interface PipelineReport {
  built_at: string;
  params: { buffer: number; cell: number };
  graph: { nodes: number; edges: number; total_length_km: number; length_weighted_green_score: number };
  city: {
    mapped_area_km2: number;
    green_share: number;
    class_area_km2: Record<string, number>;
    residential_near_garden_share: number;
    gardens: number;
    garden_plots: number;
  };
  grid: { cells: number; cell_m: number; parks_ge_1ha: number };
  vegetacija: { features_in: number; invalid_repaired: number; missing_or_empty_dropped: number };
  [k: string]: unknown;
}

export const loadReport = () => loadJson<PipelineReport>('pipeline_report.json');

/** Test hook. */
export function _clearCache() {
  cache.clear();
  graphPromise = null;
  gridPromise = null;
}
