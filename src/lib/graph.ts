import { haversine } from './geo';

/** Raw format written by pipeline/build_all.py → public/data/graph.json */
export interface RawGraph {
  meta: { bbox: [number, number, number, number]; buffer_m: number; highway_classes: string[]; osm_timestamp?: string };
  nodes: number[]; // flat lon,lat
  edges: [number, number, number, number, number, number[]][]; // u, v, length_m, green×1000, class, interior lon/lat
}

export interface Graph {
  meta: RawGraph['meta'];
  lon: Float64Array;
  lat: Float64Array;
  eu: Int32Array;
  ev: Int32Array;
  elen: Float64Array;
  /** Greenery score 0–1: share of the edge buffer covered by mapped vegetation. */
  egreen: Float64Array;
  eclass: Uint8Array;
  egeom: number[][];
  /** CSR adjacency: neighbours of node n are adjEdge[adjStart[n] .. adjStart[n+1]). */
  adjStart: Int32Array;
  adjEdge: Int32Array;
  /** Spatial bucket index for nearest-node lookup. */
  bucket: Map<string, number[]>;
}

const BUCKET_DEG = 0.004;
const bkey = (lon: number, lat: number) => `${Math.floor(lon / BUCKET_DEG)}:${Math.floor(lat / BUCKET_DEG)}`;

export function parseGraph(raw: RawGraph): Graph {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges) || raw.nodes.length % 2 !== 0) {
    throw new Error('Neispravan format grafa');
  }
  const n = raw.nodes.length / 2;
  const m = raw.edges.length;
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lon[i] = raw.nodes[2 * i];
    lat[i] = raw.nodes[2 * i + 1];
  }
  const eu = new Int32Array(m);
  const ev = new Int32Array(m);
  const elen = new Float64Array(m);
  const egreen = new Float64Array(m);
  const eclass = new Uint8Array(m);
  const egeom: number[][] = new Array(m);
  const degree = new Int32Array(n + 1);
  for (let k = 0; k < m; k++) {
    const [u, v, len, g, c, geom] = raw.edges[k];
    if (u < 0 || v < 0 || u >= n || v >= n) throw new Error(`Brid ${k} referencira nepostojeći čvor`);
    eu[k] = u;
    ev[k] = v;
    elen[k] = Math.max(0, len);
    egreen[k] = Math.min(1, Math.max(0, g / 1000));
    eclass[k] = c;
    egeom[k] = geom ?? [];
    degree[u]++;
    degree[v]++;
  }
  const adjStart = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + degree[i];
  const fill = adjStart.slice(0, n);
  const adjEdge = new Int32Array(adjStart[n]);
  for (let k = 0; k < m; k++) {
    adjEdge[fill[eu[k]]++] = k;
    adjEdge[fill[ev[k]]++] = k;
  }
  const bucket = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const key = bkey(lon[i], lat[i]);
    const arr = bucket.get(key);
    if (arr) arr.push(i);
    else bucket.set(key, [i]);
  }
  return { meta: raw.meta, lon, lat, eu, ev, elen, egreen, eclass, egeom, adjStart, adjEdge, bucket };
}

/** Nearest graph node to a point, searching up to ~1.3 km away. Returns -1 if none. */
export function nearestNode(g: Graph, lon: number, lat: number, maxRings = 3): number {
  const bx = Math.floor(lon / BUCKET_DEG);
  const by = Math.floor(lat / BUCKET_DEG);
  let best = -1;
  let bestD = Infinity;
  for (let ring = 0; ring <= maxRings; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const arr = g.bucket.get(`${bx + dx}:${by + dy}`);
        if (!arr) continue;
        for (const i of arr) {
          const d = haversine(lon, lat, g.lon[i], g.lat[i]);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    // A hit in ring r is guaranteed optimal only after checking ring r+1.
    if (best >= 0 && ring >= 1) break;
  }
  return best;
}

export function otherEnd(g: Graph, edge: number, node: number): number {
  return g.eu[edge] === node ? g.ev[edge] : g.eu[edge];
}

/** Polyline (lat,lng) for an edge traversed starting at `from`. */
export function edgeLatLngs(g: Graph, edge: number, from: number): [number, number][] {
  const pts: [number, number][] = [[g.lat[g.eu[edge]], g.lon[g.eu[edge]]]];
  const geom = g.egeom[edge];
  for (let i = 0; i < geom.length; i += 2) pts.push([geom[i + 1], geom[i]]);
  pts.push([g.lat[g.ev[edge]], g.lon[g.ev[edge]]]);
  if (g.eu[edge] !== from) pts.reverse();
  return pts;
}
