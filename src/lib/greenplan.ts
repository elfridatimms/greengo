import { clamp } from './geo';

/** Raw format of public/data/grid.json (see pipeline/build_all.py#build_grid). */
export interface RawGrid {
  meta: { cell_m: number; origin_epsg3765: [number, number]; districts: string[]; fields: Record<string, string> };
  i: number[];
  j: number[];
  d: number[];
  bounds: [number, number, number, number][]; // south, west, north, east
  green: number[];
  park: number[];
  open: number[];
  built: number[];
  res: number[];
  excl: number[];
  lugreen: number[];
  dpark: number[];
  dgarden: number[];
}

export interface Cell {
  idx: number;
  i: number;
  j: number;
  /** Cell centre in EPSG:3765 metres. */
  x: number;
  y: number;
  district: string;
  bounds: [number, number, number, number];
  green: number;
  park: number;
  open: number;
  built: number;
  res: number;
  excl: number;
  lugreen: number;
  dpark: number;
  dgarden: number;
}

export interface Grid {
  cellM: number;
  cells: Cell[];
  byIJ: Map<string, number>;
  districts: string[];
}

const ij = (i: number, j: number) => `${i}:${j}`;

export function parseGrid(raw: RawGrid): Grid {
  const n = raw?.i?.length ?? 0;
  const fields = ['j', 'd', 'bounds', 'green', 'park', 'open', 'built', 'res', 'excl', 'lugreen', 'dpark', 'dgarden'] as const;
  for (const f of fields) {
    if (!Array.isArray(raw[f]) || raw[f].length !== n) throw new Error(`grid.json: polje "${f}" nedostaje ili ima krivu duljinu`);
  }
  const cellM = raw.meta.cell_m;
  const [x0, y0] = raw.meta.origin_epsg3765;
  const cells: Cell[] = [];
  const byIJ = new Map<string, number>();
  for (let k = 0; k < n; k++) {
    const c: Cell = {
      idx: k,
      i: raw.i[k],
      j: raw.j[k],
      x: x0 + (raw.i[k] + 0.5) * cellM,
      y: y0 + (raw.j[k] + 0.5) * cellM,
      district: raw.meta.districts[raw.d[k]] ?? '—',
      bounds: raw.bounds[k],
      green: raw.green[k],
      park: raw.park[k],
      open: raw.open[k],
      built: raw.built[k],
      res: raw.res[k],
      excl: raw.excl[k],
      lugreen: raw.lugreen[k],
      dpark: raw.dpark[k],
      dgarden: raw.dgarden[k],
    };
    cells.push(c);
    byIJ.set(ij(c.i, c.j), k);
  }
  return { cellM, cells, byIJ, districts: raw.meta.districts };
}

export function neighbours(grid: Grid, c: Cell, diagonal = true): Cell[] {
  const out: Cell[] = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      if (!diagonal && di && dj) continue;
      const k = grid.byIJ.get(ij(c.i + di, c.j + dj));
      if (k !== undefined) out.push(grid.cells[k]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- scoring

export interface PlanParams {
  /** Mapped-vegetation share considered "sufficient" for the deficit factor. */
  greenTarget: number;
  /** WHO Europe indicator: green space ≥ 1 ha within 300 m linear distance. */
  parkDistanceM: number;
  /** Distance beyond which a cell counts as poorly served by community gardens. */
  gardenDistanceM: number;
  /** Cell counts as green (for connectivity) at or above this share. */
  greenCellThreshold: number;
  minResidential: number;
  maxExcluded: number;
  /** Require existing urban fabric so that fields zoned for future housing are not ranked as "under-greened". */
  minBuilt: number;
}

export const DEFAULT_PARAMS: PlanParams = {
  greenTarget: 0.3,
  parkDistanceM: 300,
  gardenDistanceM: 1000,
  greenCellThreshold: 0.3,
  minResidential: 0.25,
  maxExcluded: 0.5,
  minBuilt: 0.2,
};

export type FactorKey = 'deficit' | 'residential' | 'parkAccess' | 'gardenAccess' | 'openSurface' | 'connectivity' | 'plannedGreen';

export const FACTOR_LABELS: Record<FactorKey, string> = {
  deficit: 'Manjak mapirane vegetacije',
  residential: 'Stambena / mješovita namjena',
  parkAccess: 'Udaljenost od parka/šume ≥ 1 ha',
  gardenAccess: 'Udaljenost od gradskog vrta',
  openSurface: 'Nezapečaćene površine i dvorišta (proxy)',
  connectivity: 'Susjedstvo postojećeg zelenila',
  plannedGreen: 'Planirana zelena namjena',
};

export type Weights = Partial<Record<FactorKey, number>>;

export const TREE_WEIGHTS: Weights = { deficit: 0.35, residential: 0.25, parkAccess: 0.2, openSurface: 0.1, connectivity: 0.1 };
export const GARDEN_WEIGHTS: Weights = { gardenAccess: 0.4, residential: 0.3, openSurface: 0.2, deficit: 0.1 };

export function isEligible(c: Cell, p: PlanParams = DEFAULT_PARAMS): boolean {
  return c.res >= p.minResidential && c.excl < p.maxExcluded && c.built >= p.minBuilt;
}

/** All factors normalised to 0–1 (1 = stronger case for intervention). */
export function cellFactors(grid: Grid, c: Cell, p: PlanParams = DEFAULT_PARAMS): Record<FactorKey, number> {
  const nb = neighbours(grid, c);
  const greenNb = nb.filter(n => n.green >= p.greenCellThreshold).length;
  return {
    deficit: 1 - clamp(c.green / p.greenTarget, 0, 1),
    residential: clamp(c.res, 0, 1),
    parkAccess: clamp(c.dpark / p.parkDistanceM, 0, 1),
    gardenAccess: clamp(c.dgarden / p.gardenDistanceM, 0, 1),
    openSurface: clamp(c.open / 0.2, 0, 1),
    connectivity: nb.length ? greenNb / nb.length : 0,
    plannedGreen: clamp(c.lugreen, 0, 1),
  };
}

export function weightedScore(f: Record<FactorKey, number>, w: Weights): number {
  let s = 0;
  let tot = 0;
  for (const [k, v] of Object.entries(w) as [FactorKey, number][]) {
    s += v * f[k];
    tot += v;
  }
  return tot > 0 ? s / tot : 0;
}

export interface ScoredCell {
  cell: Cell;
  score: number;
  factors: Record<FactorKey, number>;
}

export function scoreCells(grid: Grid, w: Weights, p: PlanParams = DEFAULT_PARAMS): ScoredCell[] {
  return grid.cells
    .filter(c => isEligible(c, p))
    .map(c => {
      const factors = cellFactors(grid, c, p);
      return { cell: c, factors, score: weightedScore(factors, w) };
    })
    .sort((a, b) => b.score - a.score);
}

/** Greedy top-N selection enforcing a minimum spacing between picks. */
export function pickSpaced(scored: ScoredCell[], n: number, minSpacingM: number, avoid: Cell[] = []): ScoredCell[] {
  const picked: ScoredCell[] = [];
  for (const s of scored) {
    if (picked.length >= n) break;
    const far = [...picked.map(p => p.cell), ...avoid].every(o => Math.hypot(o.x - s.cell.x, o.y - s.cell.y) >= minSpacingM);
    if (far) picked.push(s);
  }
  return picked;
}

// ---------------------------------------------------------------- scenarios

const cellAreaKm2 = (g: Grid) => (g.cellM * g.cellM) / 1e6;

export interface GardenScenario {
  picks: ScoredCell[];
  beforeKm2: number;
  afterKm2: number;
  totalResidentialKm2: number;
}

/**
 * Residential land (Σ res × cell area) whose cell centre lies within
 * `gardenDistanceM` of a community garden, before and after adding `n`
 * candidate gardens. Uses the pipeline's measured distance to existing
 * gardens plus distances to the hypothetical new sites.
 */
export function simulateGardens(grid: Grid, n = 5, p: PlanParams = DEFAULT_PARAMS): GardenScenario {
  const scored = scoreCells(grid, GARDEN_WEIGHTS, p).filter(s => s.cell.dgarden >= p.gardenDistanceM);
  const picks = pickSpaced(scored, n, p.gardenDistanceM * 1.5);
  const a = cellAreaKm2(grid);
  let before = 0;
  let after = 0;
  let total = 0;
  for (const c of grid.cells) {
    if (c.res <= 0) continue;
    const resKm2 = c.res * a;
    total += resKm2;
    const near = c.dgarden <= p.gardenDistanceM;
    if (near) before += resKm2;
    const nearNew = near || picks.some(s => Math.hypot(s.cell.x - c.x, s.cell.y - c.y) <= p.gardenDistanceM);
    if (nearNew) after += resKm2;
  }
  return { picks, beforeKm2: before, afterKm2: after, totalResidentialKm2: total };
}

export interface TreeScenario {
  picks: ScoredCell[];
  /** Hypothetical share of the open-surface proxy that would become vegetated. */
  conversion: number;
  lowGreenBefore: number;
  lowGreenAfter: number;
  meanGreenPicksBefore: number;
  meanGreenPicksAfter: number;
}

export const LOW_GREEN = 0.1;

export function simulateTrees(grid: Grid, n = 10, conversion = 0.25, p: PlanParams = DEFAULT_PARAMS): TreeScenario {
  const picks = pickSpaced(scoreCells(grid, TREE_WEIGHTS, p), n, 500);
  const pickSet = new Set(picks.map(s => s.cell.idx));
  const conv = clamp(conversion, 0, 1);
  let before = 0;
  let after = 0;
  for (const c of grid.cells) {
    if (!isEligible(c, p)) continue;
    const g1 = pickSet.has(c.idx) ? Math.min(1, c.green + c.open * conv) : c.green;
    if (c.green < LOW_GREEN) before++;
    if (g1 < LOW_GREEN) after++;
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    picks,
    conversion: conv,
    lowGreenBefore: before,
    lowGreenAfter: after,
    meanGreenPicksBefore: mean(picks.map(s => s.cell.green)),
    meanGreenPicksAfter: mean(picks.map(s => Math.min(1, s.cell.green + s.cell.open * conv))),
  };
}

export interface ConnectivityStats {
  components: number;
  smallPatches: number;
  largestCells: number;
  greenCells: number;
}

/** 4-connected components of green cells. */
export function greenComponents(grid: Grid, isGreen: (c: Cell) => boolean): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(grid.cells.length).fill(-1);
  const sizes: number[] = [];
  for (const start of grid.cells) {
    if (label[start.idx] >= 0 || !isGreen(start)) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    label[start.idx] = id;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const nb of neighbours(grid, c, false)) {
        if (label[nb.idx] < 0 && isGreen(nb)) {
          label[nb.idx] = id;
          stack.push(nb);
        }
      }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

export function connectivityStats(grid: Grid, isGreen: (c: Cell) => boolean): ConnectivityStats {
  const { sizes } = greenComponents(grid, isGreen);
  return {
    components: sizes.length,
    smallPatches: sizes.filter(s => s <= 2).length,
    largestCells: sizes.length ? Math.max(...sizes) : 0,
    greenCells: sizes.reduce((s, x) => s + x, 0),
  };
}

export interface ConnectivityScenario {
  picks: Cell[];
  before: ConnectivityStats;
  after: ConnectivityStats;
}

/**
 * Greedily adds up to `n` non-green, eligible-for-planning cells that join
 * the largest number of distinct green components (a "stepping stone").
 */
export function simulateConnectivity(grid: Grid, n = 10, p: PlanParams = DEFAULT_PARAMS): ConnectivityScenario {
  const added = new Set<number>();
  const isGreen = (c: Cell) => c.green >= p.greenCellThreshold || added.has(c.idx);
  const before = connectivityStats(grid, isGreen);
  const picks: Cell[] = [];
  for (let k = 0; k < n; k++) {
    const { label } = greenComponents(grid, isGreen);
    let best: Cell | null = null;
    let bestJoin = 1;
    for (const c of grid.cells) {
      if (isGreen(c) || c.excl >= p.maxExcluded) continue;
      const ids = new Set<number>();
      for (const nb of neighbours(grid, c, false)) if (label[nb.idx] >= 0) ids.add(label[nb.idx]);
      if (ids.size > bestJoin) {
        bestJoin = ids.size;
        best = c;
      }
    }
    if (!best) break;
    added.add(best.idx);
    picks.push(best);
  }
  return { picks, before, after: connectivityStats(grid, isGreen) };
}
