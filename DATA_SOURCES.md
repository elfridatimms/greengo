# Izvori podataka — GreenGo Zagreb

Svi skupovi podataka javnog sektora preuzeti su **2026-11-03** preko poveznica resursa koje vraća CKAN API portala data.gov.hr
(`https://data.gov.hr/ckan/api/3/action/package_show?id=<skup>`). Točne URL-ove, veličine i SHA-256 sažetke preuzetih datoteka
bilježi [`data/raw/manifest.json`](data/raw/manifest.json); ponovno preuzimanje: `python pipeline/download.py`.

Sirove datoteke (≈ 320 MB) nisu u repozitoriju (`.gitignore`), a obrađeni izlazi jesu (`public/data/`).

## Sažetak

| # | Skup podataka | Izdavatelj | Licenca | Integrirano | Gdje utječe na rezultate |
|---|---|---|---|---|---|
| A | Topografska osnova 2018. Vegetacija i vrste zemljišta | Grad Zagreb | Otvorena dozvola (OD) | **Da** | Sloj vegetacije, ocjena zelenila svakog segmenta pješačke mreže (rutiranje), udio vegetacije po četvrtima i ćelijama, GreenPlan čimbenici, udaljenost do parka |
| B | Geoportal planirana namjena 2023 | Grad Zagreb | Otvorena dozvola (OD) | **Da** | Sloj namjene, stambena namjena (prihvatljivost i težina u GreenPlanu), isključenja (promet, infrastruktura, vode, groblja, posebna namjena), dostupnost vrtova |
| C | Geoportal gradski vrt | Grad Zagreb | CC BY 4.0 | **Da** | Sloj vrtova, dostupnost vrtova (≤ 1 km), scenarij "5 novih vrtova" |
| D | Geoportal Kvaliteta zraka | Grad Zagreb | Otvorena dozvola (OD) | **Da (samo lokacije)** | Sloj mjernih postaja. Mjerenja nisu dio skupa i **ne prikazuju se niti procjenjuju** |
| E | Gradske četvrti — prostorna jedinica mjesne samouprave | Grad Zagreb | Otvorena dozvola (OD) | **Da** | Agregacija GreenPulse pokazatelja po 17 četvrti, granica grada za mrežu ćelija |
| F | OpenStreetMap | OSM suradnici | ODbL 1.0 | **Da** (središnji Zagreb) | Graf pješačke mreže za rutiranje; pozadinska karta |
| G | Copernicus Tree Cover Density | EEA / Copernicus | Copernicus licence | **Ne** | Opcionalno; nije integrirano (vidi Ograničenja) |

## A. Topografska osnova 2018. Vegetacija i vrste zemljišta

- Stranica: https://data.gov.hr/ckan/en/dataset/topografska-osnova-2018-vegetacija-i-vrste-zemljista
- Preuzeti resurs (GeoJSON): `https://services8.arcgis.com/Usi0jGQwMmBUpFjr/arcgis/rest/services/Topografska_osnova_2018_Vegetacija_i_vrste_zemlji%C5%A1ta/FeatureServer/replicafilescache/Topografska_osnova_2018_Vegetacija_i_vrste_zemlji%C5%A1ta_-351063888473117085.geojson`
- Šifrarnik (opisi `LULCType`): `…/FeatureServer/layers?f=json` → `data/raw/meta/vegetacija_layers.json` (renderer izdavatelja)
- Licenca: Otvorena dozvola (OD); metapodaci CKAN ažurirani 2026-04-15
- Datum podataka: `DataAcquisitionDate` = 26.03.2012. (288 361 poligon, "Aerofotogrametrijsko i LiDAR snimanje 2012.") i 07.05.2018. (43 265 poligona, "Aerofotogrametrijsko snimanje 2018.", `PROMJENA=1`). Izvođač: GDi GISDATA d.o.o.
- Datoteka: 259 MB, 331 626 objekata, `Polygon`/`MultiPolygon`
- CRS: GeoJSON u EPSG:4326; izvorni servis u EPSG:3765 (HTRS96/TM). Provjereno: nakon transformacije u EPSG:3765 granice su unutar `fullExtent` servisa.
- Stupci: `OBJECTID, LULC_ID, ThematicUnit, LULCType, DataSource, DataAcquisitionDate, DataChangeDate, Contractor, Area, INSPIRE_LULC, PROMJENA` (`DataChangeDate`, `INSPIRE_LULC` su prazni)
- Validacija: 3 prazne geometrije uklonjene, 293 neispravne popravljene (`shapely.make_valid`), 0 nepoznatih šifri
- Šifre: 1 oranica · 2 livada · 3 voćnjaci i vinogradi · 4 neobradivo · 5 park · 6 šuma · 7 šikara · 8 neplodno · 9–11 izgrađeno (javne/gospodarske/prometne) · 12 dvorište · 13 objekti · 14 groblje · 15 intenzivna gospodarska djelatnost · 16 posebna namjena
- Ukupna mapirana površina: 643,1 km² (≈ površina Grada Zagreba)

## B. Geoportal planirana namjena 2023

- Stranica: https://data.gov.hr/ckan/en/dataset/geoportal-planirana-namjena-2023
- Resurs (GeoJSON): `https://services8.arcgis.com/Usi0jGQwMmBUpFjr/arcgis/rest/services/Geoportal_planirana_namjena/FeatureServer/replicafilescache/Geoportal_planirana_namjena_6350745258229595456.geojson`
- Licenca: Otvorena dozvola (OD)
- 8 999 poligona, EPSG:4326; 19 neispravnih geometrija popravljeno
- Stupci: `Namjena` (229 vrijednosti), `Skupna_namjena` (16 skupina), `Analitika`, `Naziv_plana` (95 planova: GUP, UPU, DPU), `Izradivac_plana`, `Izvorno_kartografsko_mjerilo`, `Godina_zadnje_izmjene` (1998.–2020.)
- Napomena: namjena je **planska kategorija**, a ne stvarno korištenje niti dozvola za zahvat.

## C. Geoportal gradski vrt

- Stranica: https://data.gov.hr/ckan/en/dataset/geoportal-gradski-vrt
- Resurs (GeoJSON): `https://opendata.arcgis.com/api/v3/datasets/9858b1819a914c6ba0fedd0069f2d861_1/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1` (zadnja izmjena resursa 2023-02-01)
- Licenca: **CC BY 4.0** — atribucija "Grad Zagreb" prikazana uz sloj i u aplikaciji
- 15 `MultiPolygon` objekata; stupci `naziv, adresa, grad_cetvrt, telefon, kontakt, godina_otvaranja, br_vr_parcela, br_korisnika, nadlezan, izvor, …`
- U aplikaciji se ne prikazuju telefonski brojevi i kontakti (samo naziv, adresa, četvrt, broj parcela, godina).

## D. Geoportal Kvaliteta zraka

- Stranica: https://data.gov.hr/ckan/hr/dataset/geoportal-kvaliteta-zraka
- Resurs (GeoJSON): `https://opendata.arcgis.com/api/v3/datasets/ed9898e63ec94770a8fb37713c36f8ca_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1` (zadnja izmjena 2023-04-04)
- Licenca: Otvorena dozvola (OD)
- 6 točaka (postaje: Đorđićeva, Ksaverska, Peščenica, Prilaz baruna Filipovića, Siget, Susedgrad) s tipom postaje i mjerenim tvarima
- **Ograničenje**: skup ne sadrži mjerenja. Aplikacija ne prikazuje vrijednosti i ne izvodi procjene onečišćenja iz lokacija postaja.

## E. Gradske četvrti

- Stranica: https://data.gov.hr/ckan/hr/dataset/gradske-cetvrti-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba
- Resurs (SHP): `https://data.zagreb.hr/dataset/9c52e229-09bf-4569-8e01-37f338070d02/resource/f2406ad9-34bf-4235-aa24-d71a08ae2863/download/rpj_gc.zip`
- Licenca: Otvorena dozvola (OD); `datum_a` = 2025-02-03
- 17 poligona, izvorno EPSG:3765 (`.prj`), stupci `JMS_MB, JMS_IME, Shape_Area, datum_a`

## F. OpenStreetMap

- Overpass API (`https://overpass-api.de/api/interpreter`), upit u [`pipeline/download.py`](pipeline/download.py); vremenska oznaka baze: 2026-11-03T18:13Z
- Obuhvat: bbox 15,925–16,030 E, 45,775–45,830 N (središnji Zagreb, ≈ 8 × 6 km)
- Uključeni `highway` tipovi: footway, path, pedestrian, steps, living_street, residential, service, track, cycleway, unclassified, tertiary, secondary, primary (+ `_link`), bridleway, corridor; isključeno `access=private|no`, `foot=no|private`, `area=yes`
- Rezultat: 34 521 putova → 66 565 bridova, 50 675 čvorova (najveća povezana komponenta; 456 izoliranih čvorova odbačeno)
- Licenca: ODbL 1.0 — "© OpenStreetMap suradnici" prikazano na karti. Izvedeni graf (`public/data/graph.json`) je izvedena baza podataka pod ODbL-om.
- Pozadinska karta: OSM standardne pločice (`tile.openstreetmap.org`), uz poštivanje pravila korištenja za demo promet.

## G. Copernicus Tree Cover Density — nije integrirano

Zahtijeva prijavu na Copernicus Land Monitoring Service portal za preuzimanje rastera (10 m), što nije bilo moguće automatizirati u
ovoj fazi. Nije prikazan niti korišten ni u jednom izračunu. Prijedlog za buduću fazu: dodati `tree_cover` kao dodatni čimbenik
ocjene zelenila bridova (pokrio bi drvorede koje topografska osnova ne razlikuje).

## Obrađeni izlazi (`public/data/`)

| Datoteka | Sadržaj | Ulazi |
|---|---|---|
| `graph.json` | Pješački graf s duljinom i ocjenom zelenila po bridu | F, A |
| `veg_study.geojson` | Vegetacija (šifre 2,3,5,6,7) središnjeg Zagreba, pojednostavljeno 1,5 m | A |
| `veg_city.geojson` | Vegetacija cijelog grada, pojednostavljeno 12 m, poligoni ≥ 0,25 ha | A |
| `landuse.geojson` | Planirana namjena po skupinama, pojednostavljeno 8 m | B |
| `districts.geojson` | 17 četvrti + pokazatelji | A, B, C, E |
| `grid.json` | 10 258 ćelija 250 m s čimbenicima GreenPlana | A, B, C, E |
| `gardens.geojson`, `air_stations.geojson` | Odabrani atributi | C, D |
| `pipeline_report.json` | Validacija, CRS provjere, statistike, manifest ulaza | sve |
