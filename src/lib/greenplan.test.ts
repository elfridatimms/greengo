import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMS,
  TREE_WEIGHTS,
  cellFactors,
  connectivityStats,
  isEligible,
  parseGrid,
  pickSpaced,
  scoreCells,
  simulateConnectivity,
  simulateGardens,
  simulateTrees,
  weightedScore,
  type RawGrid,
} from './greenplan';

type CellIn = Partial<Record<'green' | 'park' | 'open' | 'built' | 'res' | 'excl' | 'lugreen' | 'dpark' | 'dgarden', number>>;

/** Build a w×h synthetic grid with 250 m cells. */
function makeGrid(w: number, h: number, f: (i: number, j: number) => CellIn): RawGrid {
  const raw: RawGrid = {
    meta: { cell_m: 250, origin_epsg3765: [450000, 5070000], districts: ['A', 'B'], fields: {} },
    i: [], j: [], d: [], bounds: [], green: [], park: [], open: [], built: [], res: [], excl: [], lugreen: [], dpark: [], dgarden: [],
  };
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const c = f(i, j);
      raw.i.push(i);
      raw.j.push(j);
      raw.d.push(i < w / 2 ? 0 : 1);
      raw.bounds.push([45.8 + j * 0.00225, 15.9 + i * 0.0032, 45.8 + (j + 1) * 0.00225, 15.9 + (i + 1) * 0.0032]);
      raw.green.push(c.green ?? 0);
      raw.park.push(c.park ?? 0);
      raw.open.push(c.open ?? 0);
      raw.built.push(c.built ?? 0.5);
      raw.res.push(c.res ?? 0);
      raw.excl.push(c.excl ?? 0);
      raw.lugreen.push(c.lugreen ?? 0);
      raw.dpark.push(c.dpark ?? 0);
      raw.dgarden.push(c.dgarden ?? 0);
    }
  }
  return raw;
}

describe('parseGrid', () => {
  it('computes metric cell centres from origin and indices', () => {
    const g = parseGrid(makeGrid(2, 2, () => ({})));
    const c = g.cells.find(c => c.i === 1 && c.j === 0)!;
    expect(c.x).toBe(450000 + 375);
    expect(c.y).toBe(5070000 + 125);
    expect(c.district).toBe('B');
  });
  it('fails clearly when a field is missing or truncated', () => {
    const raw = makeGrid(2, 2, () => ({}));
    raw.green = raw.green.slice(1);
    expect(() => parseGrid(raw)).toThrow(/green/);
  });
});

describe('scoring', () => {
  it('normalises factors into 0–1', () => {
    const g = parseGrid(makeGrid(3, 3, () => ({ green: 0.05, res: 0.8, dpark: 900, dgarden: 3000, open: 0.5 })));
    const f = cellFactors(g, g.cells[4]);
    for (const v of Object.values(f)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(f.parkAccess).toBe(1);
    expect(f.deficit).toBeCloseTo(1 - 0.05 / DEFAULT_PARAMS.greenTarget);
  });
  it('weighted score is a weighted mean', () => {
    expect(weightedScore({ deficit: 1, residential: 0, parkAccess: 0, gardenAccess: 0, openSurface: 0, connectivity: 0, plannedGreen: 0 }, { deficit: 1, residential: 1 })).toBe(0.5);
  });
  it('ranks a residential, low-green, park-poor cell above a green one', () => {
    const g = parseGrid(
      makeGrid(4, 1, i => (i === 0 ? { green: 0.02, res: 0.9, dpark: 600 } : { green: 0.5, res: 0.9, dpark: 50 })),
    );
    const s = scoreCells(g, TREE_WEIGHTS);
    expect(s[0].cell.i).toBe(0);
  });
  it('excludes non-residential or transport-dominated cells', () => {
    const g = parseGrid(makeGrid(3, 1, i => [{ res: 0.1 }, { res: 0.9, excl: 0.7 }, { res: 0.9 }][i]));
    expect(g.cells.filter(c => isEligible(c)).map(c => c.i)).toEqual([2]);
  });
  it('excludes unbuilt fields that are only zoned as residential', () => {
    const g = parseGrid(makeGrid(2, 1, i => ({ res: 0.9, built: i === 0 ? 0.02 : 0.4 })));
    expect(g.cells.filter(c => isEligible(c)).map(c => c.i)).toEqual([1]);
  });
});

describe('pickSpaced', () => {
  it('enforces minimum spacing between picks', () => {
    const g = parseGrid(makeGrid(6, 1, i => ({ res: 1, green: 0, dpark: 1000 - i })));
    const picks = pickSpaced(scoreCells(g, TREE_WEIGHTS), 3, 500);
    for (let a = 0; a < picks.length; a++)
      for (let b = a + 1; b < picks.length; b++)
        expect(Math.hypot(picks[a].cell.x - picks[b].cell.x, picks[a].cell.y - picks[b].cell.y)).toBeGreaterThanOrEqual(500);
  });
});

describe('scenarios', () => {
  it('new gardens never reduce coverage and add coverage where none existed', () => {
    const g = parseGrid(makeGrid(10, 10, () => ({ res: 0.8, dgarden: 4000, open: 0.3 })));
    const s = simulateGardens(g, 5);
    expect(s.beforeKm2).toBe(0);
    expect(s.afterKm2).toBeGreaterThan(0);
    expect(s.afterKm2).toBeLessThanOrEqual(s.totalResidentialKm2 + 1e-9);
    expect(s.picks.length).toBeGreaterThan(0);
  });
  it('tree scenario with 0 % conversion changes nothing', () => {
    const g = parseGrid(makeGrid(5, 5, () => ({ res: 0.8, green: 0.05, open: 0.4, dpark: 500 })));
    const s = simulateTrees(g, 10, 0);
    expect(s.lowGreenAfter).toBe(s.lowGreenBefore);
    expect(s.meanGreenPicksAfter).toBe(s.meanGreenPicksBefore);
    const s2 = simulateTrees(g, 10, 1);
    expect(s2.lowGreenAfter).toBeLessThan(s2.lowGreenBefore);
  });
  it('connectivity: a bridging cell merges two green components', () => {
    // green | grey | green  in a 3×1 strip
    const g = parseGrid(makeGrid(3, 1, i => ({ green: i === 1 ? 0 : 0.8 })));
    expect(connectivityStats(g, c => c.green >= 0.3).components).toBe(2);
    const s = simulateConnectivity(g, 5);
    expect(s.picks.map(c => c.i)).toEqual([1]);
    expect(s.after.components).toBe(1);
  });
});
