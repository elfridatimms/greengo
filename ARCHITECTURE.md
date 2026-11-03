# Arhitektura

```
data.gov.hr (CKAN)  ──►  pipeline/download.py  ──►  data/raw/*  (+ manifest.json: URL, bajtovi, SHA-256)
OpenStreetMap (Overpass) ─┘
                                   │
                                   ▼
                     pipeline/build_all.py  (GeoPandas · Shapely 2 · pyproj, EPSG:3765)
                       ├─ load_inputs      validacija CRS-a i geometrije
                       ├─ build_graph      OSM → bridovi → ocjena zelenila (network.py)
                       ├─ build_layers     pojednostavljeni slojevi za kartu
                       ├─ build_districts  pokazatelji po četvrtima
                       └─ build_grid       ćelije 250 m za GreenPlan
                                   │
                                   ▼
                     public/data/*.json|geojson   (statičke datoteke, ≈ 14 MB, gzip ≈ 3 MB)
                                   │
                                   ▼
             React 19 + TypeScript + Vite  —  statička SPA (bez backenda)
             ┌──────────────────────────────────────────────────────────┐
             │ App.tsx  navigacija: Istraži · Rute · GreenPulse ·       │
             │          GreenPlan · Prijavi                             │
             │ MapCanvas (Leaflet, canvas renderer) + mapContext        │
             │   EnvLayers   vegetacija/namjena/vrtovi/postaje/četvrti  │
             │   useMapLayer hook za mount/unmount slojeva              │
             │ lib/graph.ts      CSR graf + prostorni indeks            │
             │ lib/routing.ts    A*, trošak zelenila, ograničenje       │
             │ lib/greenplan.ts  čimbenici, ocjene, scenariji           │
             │ lib/data.ts       učitavanje + jasne pogreške            │
             │ lib/storage.ts    lokalne demo prijave/bodovi            │
             └──────────────────────────────────────────────────────────┘
```

## Ključne odluke

- **Bez backenda.** Svi podaci javnog sektora unaprijed se obrađuju u statičke datoteke; rutiranje (≈ 50 tis. čvorova) i scenariji
  računaju se u pregledniku u milisekundama. Hosting: bilo koji statički host (`vercel.json` uključen).
- **Lijeno učitavanje.** Graf (4 MB) učitava se tek na kartici Rute; detaljni sloj vegetacije tek od zuma 14.
- **Leaflet canvas renderer** za tisuće poligona/ćelija; geometrije su pojednostavljene u pipelineu (1,5–15 m) i zaokružene na 5 decimala.
- **Provenijencija u sučelju.** Svaka metrika nosi oznaku *Iz skupa podataka / Izvedeno prostornom analizom / Simulacija / Lokalni demo*
  i poveznicu na izvor (`src/data/sources.ts`).
- **Prijave**: `localStorage`, fotografije se ponovno kodiraju kroz canvas (uklanja EXIF/GPS), opis se čisti od e-mailova i telefona,
  jasna oznaka da se ništa ne prosljeđuje Gradu.

## Što je preuzeto iz izvornog repozitorija

| Izvorno (SplitSheepAI) | GreenGo Zagreb |
|---|---|
| Vite/React/TS konfiguracija, `vercel.json`, ESLint | zadržano (uklonjen HTTPS plugin za kameru) |
| `SatelliteMap.tsx` imperativni Leaflet obrazac | `MapCanvas.tsx` + `useMapLayer` |
| `storage.ts` (`readJson`/`writeJson`) | zadržan obrazac, novi model prijava |
| `gamification.ts` (bodovi, nagrade) | prilagođeno okolišnim aktivnostima |
| `ReportIssueModal` (mreža kategorija) | `ReportView` s lokacijom, opisom, fotografijom, statusom |
| `PalacePulseDashboard` (KPI kartice) | `PulseView` s izvedenim pokazateljima |
| `routeEngine.ts`, `pressureModel.ts`, AR/Three.js, sadržaj o Splitu i Dioklecijanu, lažne prijave | **uklonjeno** |
