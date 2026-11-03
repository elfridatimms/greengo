import { edgeLatLngs, otherEnd, type Graph } from './graph';
import { haversine } from './geo';

/** Walking speed used for duration estimates (km/h). */
export const WALK_KMH = 4.8;
/** Edge counts as "near mapped vegetation" at or above this greenery score. */
export const NEAR_VEG_THRESHOLD = 0.3;

/**
 * Cost of traversing an edge:
 *   cost = length_m × (1 + greeneryWeight × (1 − greenScore))
 * greeneryWeight = 0 gives the plain shortest path.
 */
export function edgeCost(lengthM: number, greenScore: number, greeneryWeight: number): number {
  return lengthM * (1 + greeneryWeight * (1 - greenScore));
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const k = this.keys;
    const v = this.vals;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < k.length && k[l] < k[s]) s = l;
        if (r < k.length && k[r] < k[s]) s = r;
        if (s === i) break;
        [k[s], k[i]] = [k[i], k[s]];
        [v[s], v[i]] = [v[i], v[s]];
        i = s;
      }
    }
    return top;
  }
}

export interface PathResult {
  nodes: number[];
  edges: number[];
  cost: number;
}

/**
 * A* search. The straight-line heuristic is admissible because every edge
 * cost is ≥ its length (the greenery factor is ≥ 1) and edge length ≥ the
 * straight-line distance between its end nodes.
 */
export function shortestPath(g: Graph, source: number, target: number, greeneryWeight: number): PathResult | null {
  const n = g.lon.length;
  if (source < 0 || target < 0 || source >= n || target >= n) return null;
  if (source === target) return { nodes: [source], edges: [], cost: 0 };
  const dist = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const tLon = g.lon[target];
  const tLat = g.lat[target];
  // 0.999 guards against rounding of edge lengths vs. haversine.
  const h = (i: number) => 0.999 * haversine(g.lon[i], g.lat[i], tLon, tLat);
  const heap = new MinHeap();
  dist[source] = 0;
  heap.push(h(source), source);
  while (heap.size) {
    const u = heap.pop();
    if (closed[u]) continue;
    if (u === target) break;
    closed[u] = 1;
    for (let a = g.adjStart[u]; a < g.adjStart[u + 1]; a++) {
      const e = g.adjEdge[a];
      const v = otherEnd(g, e, u);
      if (closed[v]) continue;
      const nd = dist[u] + edgeCost(g.elen[e], g.egreen[e], greeneryWeight);
      if (nd < dist[v]) {
        dist[v] = nd;
        prevEdge[v] = e;
        heap.push(nd + h(v), v);
      }
    }
  }
  if (!Number.isFinite(dist[target])) return null;
  const nodes = [target];
  const edges: number[] = [];
  let cur = target;
  while (cur !== source) {
    const e = prevEdge[cur];
    edges.push(e);
    cur = otherEnd(g, e, cur);
    nodes.push(cur);
  }
  nodes.reverse();
  edges.reverse();
  return { nodes, edges, cost: dist[target] };
}

export interface RouteStats {
  lengthM: number;
  minutes: number;
  /** Length-weighted mean greenery score (0–1). */
  meanGreen: number;
  /** Share of route length on edges with greenery score ≥ NEAR_VEG_THRESHOLD. */
  shareNearVeg: number;
  /** Length by OSM highway class name. */
  byClass: Record<string, number>;
}

export function routeStats(g: Graph, edges: number[]): RouteStats {
  let len = 0;
  let green = 0;
  let near = 0;
  const byClass: Record<string, number> = {};
  for (const e of edges) {
    const l = g.elen[e];
    len += l;
    green += l * g.egreen[e];
    if (g.egreen[e] >= NEAR_VEG_THRESHOLD) near += l;
    const cls = g.meta.highway_classes[g.eclass[e]] ?? 'other';
    byClass[cls] = (byClass[cls] ?? 0) + l;
  }
  return {
    lengthM: len,
    minutes: len / ((WALK_KMH * 1000) / 60),
    meanGreen: len ? green / len : 0,
    shareNearVeg: len ? near / len : 0,
    byClass,
  };
}

export interface Route {
  path: PathResult;
  stats: RouteStats;
  latlngs: [number, number][];
}

export function toRoute(g: Graph, path: PathResult): Route {
  const latlngs: [number, number][] = [];
  for (let i = 0; i < path.edges.length; i++) {
    const seg = edgeLatLngs(g, path.edges[i], path.nodes[i]);
    if (latlngs.length) seg.shift();
    latlngs.push(...seg);
  }
  if (!latlngs.length && path.nodes.length) latlngs.push([g.lat[path.nodes[0]], g.lon[path.nodes[0]]]);
  return { path, stats: routeStats(g, path.edges), latlngs };
}

export interface ComparisonOptions {
  /** User preference 0 (shortest) … 1 (greenest). Mapped to greeneryWeight 0…maxWeight. */
  preference: number;
  /** Maximum allowed extra length of the green route, e.g. 0.25 = +25 %. */
  maxDetour: number;
  maxWeight?: number;
}

export interface RouteComparison {
  shortest: Route;
  green: Route;
  /** Greenery weight actually used (may be lowered to respect maxDetour). */
  usedWeight: number;
  requestedWeight: number;
  detourCapped: boolean;
  sameRoute: boolean;
}

export const DEFAULT_MAX_WEIGHT = 3;

/**
 * Computes the shortest route and a greener alternative. If the greener route
 * exceeds the detour limit, the greenery weight is reduced by bisection until
 * it fits (falling back to the shortest route).
 */
export function compareRoutes(g: Graph, s: number, t: number, opts: ComparisonOptions): RouteComparison | null {
  const sp = shortestPath(g, s, t, 0);
  if (!sp) return null;
  const shortest = toRoute(g, sp);
  const requestedWeight = Math.max(0, opts.preference) * (opts.maxWeight ?? DEFAULT_MAX_WEIGHT);
  const limit = shortest.stats.lengthM * (1 + Math.max(0, opts.maxDetour)) + 1e-6;

  const tryWeight = (w: number) => {
    const p = shortestPath(g, s, t, w);
    return p ? toRoute(g, p) : null;
  };

  let usedWeight = requestedWeight;
  let green = requestedWeight > 0 ? tryWeight(requestedWeight) : shortest;
  let capped = false;
  if (green && green.stats.lengthM > limit) {
    capped = true;
    let lo = 0;
    let hi = requestedWeight;
    let best: Route = shortest;
    let bestW = 0;
    for (let it = 0; it < 7; it++) {
      const mid = (lo + hi) / 2;
      const r = tryWeight(mid);
      if (r && r.stats.lengthM <= limit) {
        best = r;
        bestW = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    green = best;
    usedWeight = bestW;
  }
  if (!green) green = shortest;
  const sameRoute =
    green.path.edges.length === shortest.path.edges.length &&
    green.path.edges.every((e, i) => e === shortest.path.edges[i]);
  return { shortest, green, usedWeight, requestedWeight, detourCapped: capped, sameRoute };
}

/** Human-readable Croatian explanation of the recommendation. */
export function explainComparison(c: RouteComparison): string[] {
  const s = c.shortest.stats;
  const gr = c.green.stats;
  const out: string[] = [];
  if (c.sameRoute) {
    out.push('Najkraća ruta je ujedno i najzelenija dostupna ruta unutar zadanog ograničenja obilaska.');
    if (c.detourCapped) out.push('Zelenije varijante postoje, ali premašuju zadano maksimalno produljenje.');
    return out;
  }
  const extra = gr.lengthM - s.lengthM;
  const extraPct = s.lengthM ? extra / s.lengthM : 0;
  out.push(
    `Zelenija ruta je ${Math.round(extra)} m (${(extraPct * 100).toFixed(0)} %) duža i traje oko ${Math.max(
      0,
      Math.round(gr.minutes - s.minutes),
    )} min više.`,
  );
  out.push(
    `Uz mapiranu vegetaciju prolazi ${(gr.shareNearVeg * 100).toFixed(0)} % njezine duljine, naspram ${(
      s.shareNearVeg * 100
    ).toFixed(0)} % kod najkraće rute.`,
  );
  out.push(
    `Prosječna izloženost zelenilu (udio pojasa ±buffer oko puta pod vegetacijom) raste s ${(s.meanGreen * 100).toFixed(
      0,
    )} % na ${(gr.meanGreen * 100).toFixed(0)} %.`,
  );
  if (c.detourCapped) {
    out.push('Težina zelenila automatski je smanjena kako ruta ne bi premašila zadano maksimalno produljenje.');
  }
  return out;
}
