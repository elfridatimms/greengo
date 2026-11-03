/**
 * Local demo persistence (localStorage). Nothing here leaves the device and
 * nothing is forwarded to the City of Zagreb.
 */
export type ReportCategory = 'otpad' | 'stablo' | 'vegetacija' | 'park' | 'infrastruktura';
export type ReportStatus = 'zaprimljeno' | 'u-provjeri' | 'rijeseno';

export interface EnvReport {
  id: string;
  category: ReportCategory;
  lat: number;
  lng: number;
  description: string;
  /** JPEG data URL, re-encoded in the browser (metadata such as GPS EXIF removed). */
  photo?: string;
  timestamp: number;
  status: ReportStatus;
}

const KEYS = {
  reports: 'greengo-reports',
  points: 'greengo-points',
  achievements: 'greengo-achievements',
  routes: 'greengo-route-log',
} as const;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; /* quota / private mode */
  }
}

export const MAX_DESCRIPTION = 500;

/** Remove e-mail addresses and phone numbers users may type into free text. */
export function sanitizeDescription(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[uklonjeno]')
    .replace(/(\+?\d[\d\s/-]{7,}\d)/g, '[uklonjeno]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DESCRIPTION);
}

export function getReports(): EnvReport[] {
  const list = readJson<EnvReport[]>(KEYS.reports, []);
  return Array.isArray(list) ? list : [];
}

export function saveReport(r: Omit<EnvReport, 'id' | 'timestamp' | 'status'>): EnvReport | null {
  const entry: EnvReport = {
    ...r,
    description: sanitizeDescription(r.description),
    id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    status: 'zaprimljeno',
  };
  return writeJson(KEYS.reports, [...getReports(), entry]) ? entry : null;
}

export function updateReportStatus(id: string, status: ReportStatus): void {
  writeJson(KEYS.reports, getReports().map(r => (r.id === id ? { ...r, status } : r)));
}

export function deleteReport(id: string): void {
  writeJson(KEYS.reports, getReports().filter(r => r.id !== id));
}

export function getPoints(): number {
  return readJson<number>(KEYS.points, 0);
}

export function addPoints(n: number): number {
  const next = getPoints() + Math.max(0, Math.round(n));
  writeJson(KEYS.points, next);
  return next;
}

export function getAchievements(): string[] {
  return readJson<string[]>(KEYS.achievements, []);
}

export function unlockAchievement(id: string): boolean {
  const cur = getAchievements();
  if (cur.includes(id)) return false;
  writeJson(KEYS.achievements, [...cur, id]);
  return true;
}

export interface RouteLogEntry {
  t: number;
  shortestM: number;
  greenM: number;
  shortestNear: number;
  greenNear: number;
}

export function logRoute(e: RouteLogEntry): void {
  writeJson(KEYS.routes, [...readJson<RouteLogEntry[]>(KEYS.routes, []), e].slice(-200));
}

export function getRouteLog(): RouteLogEntry[] {
  return readJson<RouteLogEntry[]>(KEYS.routes, []);
}

export function resetLocalData(): void {
  try {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  } catch {
    /* private mode */
  }
}
