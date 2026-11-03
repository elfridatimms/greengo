import { beforeEach, describe, expect, it } from 'vitest';
import { DataLoadError, _clearCache, loadGeoJson, loadJson } from './data';
import { sanitizeDescription } from './storage';

const respond = (body: string, status = 200): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;

describe('dataset loading failures', () => {
  beforeEach(() => _clearCache());

  it('reports HTTP errors with the file name', async () => {
    await expect(loadJson('missing.json', respond('', 404))).rejects.toThrow(/missing\.json: HTTP 404/);
  });
  it('reports network errors', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    await expect(loadJson('x.json', failing)).rejects.toBeInstanceOf(DataLoadError);
  });
  it('reports invalid JSON', async () => {
    await expect(loadJson('bad.json', respond('{not json'))).rejects.toThrow(/nije ispravan JSON/);
  });
  it('rejects non-FeatureCollection GeoJSON', async () => {
    await expect(loadGeoJson('a.geojson', respond('{"type":"Feature"}'))).rejects.toThrow(/FeatureCollection/);
  });
  it('drops features with missing geometry', async () => {
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: {} }, { type: 'Feature', geometry: { type: 'Point', coordinates: [16, 45.8] }, properties: {} }] };
    const out = await loadGeoJson('b.geojson', respond(JSON.stringify(fc)));
    expect(out.features).toHaveLength(1);
  });
  it('does not cache failures', async () => {
    await expect(loadJson('retry.json', respond('', 500))).rejects.toThrow();
    await expect(loadJson('retry.json', respond('{"ok":1}'))).resolves.toEqual({ ok: 1 });
  });
});

describe('report content safeguards', () => {
  it('removes e-mail addresses and phone numbers', () => {
    const s = sanitizeDescription('Javite se na ivan.horvat@example.com ili 091 234 5678 hvala');
    expect(s).not.toMatch(/example\.com/);
    expect(s).not.toMatch(/5678/);
    expect(s).toMatch(/\[uklonjeno\]/);
  });
  it('limits description length', () => {
    expect(sanitizeDescription('a'.repeat(2000))).toHaveLength(500);
  });
});
