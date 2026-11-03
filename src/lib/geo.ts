export type LonLat = [number, number];

const R = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits).replace('.', ',')} %`;
export const fmtInt = (n: number) => Math.round(n).toLocaleString('hr-HR');
export const fmtKm = (m: number) => `${(m / 1000).toFixed(2).replace('.', ',')} km`;
