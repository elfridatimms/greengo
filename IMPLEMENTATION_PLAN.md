# GreenGo Zagreb — plan implementacije

## 1. Nalazi revizije postojećeg repozitorija (SplitSheepAI / DioklecijanGo)

| Područje | Stanje u izvornom kodu | Odluka |
|---|---|---|
| Stack | React 19 + TypeScript 6 + Vite 8, Leaflet 1.9, Three.js, lucide-react. Nema testova, nema backenda, nema env varijabli. Build: `tsc -b && vite build`. | **Zadržano** (React/TS/Vite/Leaflet). Dodan Vitest. Three.js uklonjen. |
| Karta | `SatelliteMap.tsx` — Leaflet, Esri satelit, centar Split `[43.5085, 16.4378]`, divIcon pinovi. | **Prilagođeno**: obrazac imperativnog Leaflet hooka zadržan, nova karta Zagreba sa slojevima (vegetacija, namjena, vrtovi, postaje, rute, prijave, GreenPlan). |
| "Routing" | `routeEngine.ts` — nije stvarno rutiranje: 5 ručno zadanih nizova zona Splita, odabir prema satu. | **Zamijenjeno** stvarnim grafom OSM pješačke mreže + Dijkstra/A* s troškom zelenila. |
| Model pritiska zona | `pressureModel.ts` — izmišljene krivulje po satu + pseudoslučajni "jitter" + demo override. Simulirani podaci. | **Uklonjeno** (nema stvarnih podataka; ne podržava okolišni slučaj). |
| Dashboard | `PalacePulseDashboard.tsx` + `pulseStats.ts` — sve metrike izvedene iz simuliranog modela. | **Zamijenjeno** s GreenPulse; zadržan raspored kartica/KPI. Sve metrike iz `public/data/*.json` izračunatih u pipelineu. |
| Prijave | `ReportIssueModal.tsx`, `storage.ts` (localStorage), `mockReports.ts` (lažne seed prijave). | **Prilagođeno**: nove okolišne kategorije, lokacija na karti, opis, fotografija (ponovno kodirana → bez EXIF), status. Lažne seed prijave **uklonjene**. Jasno označen lokalni demo način. |
| Gamifikacija | `gamification.ts` — bodovi za "mirnu rutu", priče. | **Prilagođeno** (sekundarno): bodovi za zelene rute, posjet vrtovima, korisne prijave, edukativne kartice. |
| AR / 3D | Three.js rimski vojnik, kamera, DeviceOrientation, slike vojnika (1,8 MB). | **Uklonjeno** — ne doprinosi okolišnoj analizi. |
| Sadržaj | `landmarks.ts`, `soldiers.ts`, `zones.ts`, `guideMessages.ts`, `uiStrings.ts` — Split, Dioklecijan, bonton, "riva" dijalekt. | **Uklonjeno**. Novi hrvatski tekstovi. |
| Dizajn | Tamna "rimska zlatna" tema u `global.css` (56 KB). | **Zamijenjeno** novom svijetlom civic-tech temom s CSS tokenima; zadržani obrasci (bottom sheet, chipovi, modal). |
| Config | `.claude/launch.json` s apsolutnom putanjom korisnika, `vercel.json` SPA rewrite, HTTPS dev plugin (za kameru). | `vercel.json` zadržan, launch.json ažuriran, HTTPS isključen po defaultu (kamera više nije potrebna). |

## 2. Arhitektura rješenja

1. **Python pipeline** (`pipeline/`, GeoPandas/Shapely/pyproj/NetworkX):
   `download.py` → `build_all.py` → statički JSON/GeoJSON u `public/data/`.
   Sve prostorne operacije u **HTRS96/TM (EPSG:3765)**, izlaz u WGS84.
2. **Frontend** čita samo statičke datoteke (nema backenda); rutiranje i scenariji računaju se u pregledniku.

## 3. Redoslijed (prioriteti iz zadatka)

1. P1: build radi, Zagreb umjesto Splita, uklonjen turistički sadržaj, stvarna vegetacija na karti, `DATA_SOURCES.md`.
2. P2: graf OSM pješačke mreže s ocjenom zelenila po bridu, najkraća + zelenija ruta, usporedba i objašnjenje, GreenPulse.
3. P3: GreenPlan mreža ćelija 250 m, ocjena prioriteta, dostupnost vrtova, simulator scenarija.
4. P4: prijave, gamifikacija, edukacija.
5. Testovi (pytest + Vitest), build, dokumentacija.

## 4. Područje analize

- **Grad Zagreb (cijeli)**: GreenPulse po gradskim četvrtima, GreenPlan ćelije.
- **Središnji Zagreb (bbox 15.925–16.030 E, 45.775–45.830 N)**: pješačka mreža za rutiranje i detaljni sloj vegetacije (veličina podataka u pregledniku).
