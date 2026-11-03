# GreenGo Zagreb — Istraži, zaštiti, obnovi

Okolišna platforma za Zagreb izrađena iz **otvorenih podataka Grada Zagreba s data.gov.hr** i OpenStreetMapa
(Datathon otvorenih podataka 2026, MPUDT — izazov B: Okoliš i održivi prostor).

- **Istraži** — interaktivna karta: mapirana vegetacija (Topografska osnova 2018), planirana namjena 2023, gradski vrtovi,
  mjerne postaje kvalitete zraka, gradske četvrti, prijave.
- **Rute** — najkraća i zelenija pješačka ruta na OSM grafu središnjeg Zagreba; ocjena zelenila svakog segmenta izračunata iz
  vegetacijskog skupa; podesiva preferencija i maksimalno produljenje; objašnjenje preporuke.
- **GreenPulse** — udio vegetacije po četvrtima, struktura pokrova, dostupnost gradskih vrtova, područja s ograničenom vegetacijom.
- **GreenPlan** — transparentni model prioriteta za sadnju drveća i nove vrtove (ćelije 250 m), simulator scenarija.
- **Prijavi** — prijava okolišnih problema (lokalni demo, ništa se ne šalje Gradu).

Dokumentacija: [DATA_SOURCES.md](DATA_SOURCES.md) · [METHODOLOGY.md](METHODOLOGY.md) · [ARCHITECTURE.md](ARCHITECTURE.md) ·
[DATATHON_SUBMISSION.md](DATATHON_SUBMISSION.md) · [DEMO_SCRIPT.md](DEMO_SCRIPT.md) · [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) ·
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## Brzo pokretanje (obrađeni podaci su u repozitoriju)

```bash
npm install
```

```bash
npm run dev
```

Otvorite http://localhost:5173. Produkcijski build i testovi:

```bash
npm run build && npm run preview
```

```bash
npm test
```

## Ponovna obrada podataka (reproducibilnost)

Zahtijeva Python ≥ 3.11. Iz mape iznad projekta (skripte u `package.json` očekuju `../.venv`) ili prilagodite putanju:

```bash
python3 -m venv ../.venv && ../.venv/bin/pip install -r pipeline/requirements.txt
```

```bash
npm run data:download   # preuzima ≈ 320 MB u data/raw/ i piše manifest.json (SHA-256)
```

```bash
npm run data:build      # ≈ 1–2 min; piše public/data/*
```

```bash
../.venv/bin/python -m pytest pipeline/tests
```

Parametri: `pipeline/build_all.py --buffer 20 --cell 250` (pojas oko puta u m, veličina ćelije u m).

## Struktura

```
pipeline/        Python: download.py, build_all.py, network.py, geo_common.py, tests/
data/raw/        sirovi podaci (git-ignored) + manifest.json + meta/ (šifrarnik izdavatelja)
public/data/     obrađeni podaci koje koristi aplikacija
src/lib/         graf, rutiranje, GreenPlan, učitavanje, pohrana (+ *.test.ts)
src/components/  karta, slojevi, prikazi
```

## Licence

Kod: MIT ([LICENSE](LICENSE)). Podaci: Grad Zagreb — Otvorena dozvola / CC BY 4.0; OpenStreetMap — ODbL 1.0
(izvedeni `public/data/graph.json` je pod ODbL-om). Vidi [DATA_SOURCES.md](DATA_SOURCES.md).
