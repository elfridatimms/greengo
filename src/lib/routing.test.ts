import { describe, expect, it } from 'vitest';
import { parseGraph, nearestNode, type RawGraph } from './graph';
import { compareRoutes, edgeCost, explainComparison, routeStats, shortestPath } from './routing';
import { haversine } from './geo';

/**
 * Synthetic test network (≈ 100 m spacing at Zagreb latitude):
 *
 *   A(0) ── grey 300 m ── B(1)
 *    \                     /
 *     C(2) ─ green 400 m ─ D(3)     (A–C and D–B: 50 m, green)
 *
 *   E(4) isolated node
 */
const LAT = 45.81;
const lonAt = (m: number) => 15.97 + m / (111320 * Math.cos((LAT * Math.PI) / 180));
const latAt = (m: number) => LAT + m / 110574;

function rawGraph(): RawGraph {
  return {
    meta: { bbox: [15.9, 45.7, 16.1, 45.9], buffer_m: 20, highway_classes: ['footway', 'residential', 'other'] },
    nodes: [lonAt(0), latAt(0), lonAt(300), latAt(0), lonAt(0), latAt(-50), lonAt(300), latAt(-50), lonAt(5000), latAt(5000)],
    edges: [
      [0, 1, 300, 0, 1, []],
      [0, 2, 50, 900, 0, []],
      [2, 3, 400, 900, 0, [lonAt(150), latAt(-60)]],
      [3, 1, 50, 900, 0, []],
    ],
  };
}

describe('edgeCost', () => {
  it('equals length when weight is 0 or the edge is fully green', () => {
    expect(edgeCost(100, 0.2, 0)).toBe(100);
    expect(edgeCost(100, 1, 5)).toBe(100);
  });
  it('implements distance × (1 + w × (1 − g))', () => {
    expect(edgeCost(100, 0.25, 2)).toBeCloseTo(100 * (1 + 2 * 0.75));
  });
});

describe('parseGraph', () => {
  it('builds symmetric adjacency', () => {
    const g = parseGraph(rawGraph());
    expect(g.lon.length).toBe(5);
    expect(g.adjStart[1] - g.adjStart[0]).toBe(2); // node 0 has 2 edges
    expect(g.adjStart[5] - g.adjStart[4]).toBe(0); // isolated
  });
  it('rejects malformed input', () => {
    expect(() => parseGraph({ ...rawGraph(), nodes: [1, 2, 3] })).toThrow();
    const bad = rawGraph();
    bad.edges.push([0, 99, 10, 0, 0, []]);
    expect(() => parseGraph(bad)).toThrow(/nepostojeći/);
  });
  it('clamps green scores into 0–1', () => {
    const r = rawGraph();
    r.edges[0][3] = 1500;
    expect(parseGraph(r).egreen[0]).toBe(1);
  });
});

describe('shortestPath', () => {
  const g = parseGraph(rawGraph());
  it('finds the direct route when greenery is ignored', () => {
    const p = shortestPath(g, 0, 1, 0)!;
    expect(p.edges).toEqual([0]);
    expect(p.cost).toBe(300);
  });
  it('switches to the green detour when greenery weight is high', () => {
    const p = shortestPath(g, 0, 1, 3)!;
    expect(p.nodes).toEqual([0, 2, 3, 1]);
  });
  it('handles source === target', () => {
    expect(shortestPath(g, 2, 2, 1)).toEqual({ nodes: [2], edges: [], cost: 0 });
  });
  it('returns null for disconnected or invalid nodes', () => {
    expect(shortestPath(g, 0, 4, 0)).toBeNull();
    expect(shortestPath(g, -1, 1, 0)).toBeNull();
    expect(shortestPath(g, 0, 999, 0)).toBeNull();
  });
});

describe('routeStats', () => {
  const g = parseGraph(rawGraph());
  it('computes length, duration and length-weighted greenery', () => {
    const s = routeStats(g, [1, 2, 3]);
    expect(s.lengthM).toBe(500);
    expect(s.meanGreen).toBeCloseTo(0.9);
    expect(s.shareNearVeg).toBe(1);
    expect(s.minutes).toBeCloseTo(500 / 80);
    expect(s.byClass.footway).toBe(500);
  });
  it('is zero for an empty route', () => {
    expect(routeStats(g, [])).toMatchObject({ lengthM: 0, meanGreen: 0, shareNearVeg: 0 });
  });
});

describe('compareRoutes', () => {
  const g = parseGraph(rawGraph());
  it('returns a greener alternative within the detour limit', () => {
    const c = compareRoutes(g, 0, 1, { preference: 1, maxDetour: 1 })!;
    expect(c.sameRoute).toBe(false);
    expect(c.green.stats.lengthM).toBe(500);
    expect(c.green.stats.shareNearVeg).toBeGreaterThan(c.shortest.stats.shareNearVeg);
    expect(explainComparison(c).join(' ')).toMatch(/200 m/);
  });
  it('caps the detour and falls back to the shortest route', () => {
    const c = compareRoutes(g, 0, 1, { preference: 1, maxDetour: 0.25 })!;
    expect(c.detourCapped).toBe(true);
    expect(c.sameRoute).toBe(true);
    expect(c.green.stats.lengthM).toBeLessThanOrEqual(300 * 1.25);
  });
  it('preference 0 equals the shortest path', () => {
    const c = compareRoutes(g, 0, 1, { preference: 0, maxDetour: 1 })!;
    expect(c.sameRoute).toBe(true);
    expect(c.usedWeight).toBe(0);
  });
  it('builds a continuous polyline including interior geometry', () => {
    const c = compareRoutes(g, 0, 1, { preference: 1, maxDetour: 1 })!;
    expect(c.green.latlngs.length).toBe(5); // 4 nodes + 1 interior vertex
    expect(c.green.latlngs[0]).toEqual([g.lat[0], g.lon[0]]);
    expect(c.green.latlngs.at(-1)).toEqual([g.lat[1], g.lon[1]]);
  });
});

describe('nearestNode', () => {
  const g = parseGraph(rawGraph());
  it('snaps to the closest node', () => {
    expect(nearestNode(g, lonAt(280), latAt(5))).toBe(1);
    expect(nearestNode(g, lonAt(10), latAt(-45))).toBe(2);
  });
  it('returns -1 far outside the network', () => {
    expect(nearestNode(g, 17.5, 43.5)).toBe(-1);
  });
});

describe('haversine', () => {
  it('matches known Zagreb distance (Jelačić → Glavni kolodvor ≈ 1 km)', () => {
    const d = haversine(15.9772, 45.8131, 15.9785, 45.8045);
    expect(d).toBeGreaterThan(900);
    expect(d).toBeLessThan(1000);
  });
});
