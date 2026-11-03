# Metodologija

Sve prostorne operacije izvode se u **HTRS96/TM (EPSG:3765)**, službenom projiciranom sustavu RH (metri). Izlaz za web je WGS84.
Kod: [`pipeline/build_all.py`](pipeline/build_all.py), [`pipeline/network.py`](pipeline/network.py),
[`src/lib/routing.ts`](src/lib/routing.ts), [`src/lib/greenplan.ts`](src/lib/greenplan.ts).

## 1. Definicija "mapirane vegetacije"

Iz Topografske osnove 2018 (skup A) kao vegetacija se računaju šifre **2 livada, 3 voćnjaci i vinogradi, 5 park, 6 šuma, 7 šikara**.
Oranice (1) nisu uključene jer su sezonski gola tla. Dvorišta (12) nisu uključena jer skup ne razlikuje zelena od popločenih.
Skup sadrži poligone pokrova, ne pojedinačna stabla — drvoredi uz ulice zato nisu zasebno vidljivi, što **podcjenjuje** zelenilo uličnih koridora.
Većina poligona potječe iz 2012., dio je ažuriran 2018.

## 2. Pješački graf i ocjena zelenila bridova

1. OSM putovi (skup F) dijele se na bridove na svakom čvoru koji dijele dva ili više putova te na krajevima puta.
2. Svaki brid se projicira u EPSG:3765; duljina = duljina projicirane linije.
3. Oko brida se izrađuje pojas `buffer = 20 m` (ravni završeci; parametar `--buffer`).
4. Vegetacijski poligoni u obuhvatu spajaju se (`union_all`) i razlažu na nepreklapajuće dijelove (STRtree indeks).
5. **Ocjena zelenila** `g ∈ [0, 1]` = površina presjeka pojasa i vegetacije / površina pojasa. Vrijednost je udio i već je normalizirana.
6. Zadržava se najveća povezana komponenta grafa.

Prosječna duljinski ponderirana ocjena mreže: **0,28** (66 565 bridova, 1 907 km).

**Ograničenje**: ocjena je pokazatelj prostorne blizine mapirane vegetacije. Nije mjerenje hlada, temperature, kvalitete zraka
ni toplinske ugodnosti, i aplikacija rutu nikad ne naziva "hladnijom".

## 3. Rutiranje

Trošak brida:

```
cost = length_m × (1 + w × (1 − g))
```

- `w = 0` → najkraća ruta. Korisnička preferencija p ∈ [0, 1] preslikava se u `w = 3p`.
- Algoritam: **A\*** s heuristikom `0,999 × haversine(čvor, cilj)`. Heuristika je dopustiva jer je `cost ≥ length ≥ zračna udaljenost`.
- **Ograničenje obilaska**: ako zelenija ruta premašuje `(1 + maxDetour) × duljina najkraće` (zadano +25 %), težina `w` smanjuje
  se bisekcijom (7 iteracija) do najveće težine koja zadovoljava ograničenje; inače se vraća najkraća ruta.
- Pokazatelji rute: duljina, trajanje (4,8 km/h), duljinski ponderirana prosječna ocjena zelenila, **udio duljine "uz vegetaciju"**
  (bridovi s `g ≥ 0,3`).
- Točke se lijepe na najbliži čvor (prostorni indeks 0,004°); točke udaljenije od 250 m od mreže se odbijaju.

## 4. GreenPulse pokazatelji

| Pokazatelj | Izračun | Oznaka |
|---|---|---|
| Udio mapirane vegetacije (grad, četvrt) | Σ površine šifri 2,3,5,6,7 / ukupna mapirana površina; presjek s četvrtima (`gpd.overlay`); zgrade (šifra 13, 274 tis. poligona) dodijeljene po centroidu | Izvedeno |
| Površina parkova | Σ šifre 5 | Iz skupa |
| Struktura pokrova | površina po skupinama šifri | Izvedeno |
| Stambene površine ≤ 1 km od vrta | presjek poligona stambene/mješovite namjene (B) s unijom pojaseva 1 km oko vrtova (C), po četvrtima | Izvedeno |
| Ćelije s ograničenom vegetacijom | ćelije 250 m s ≥ 50 % stambene namjene, ≥ 20 % izgrađenih površina i < 10 % vegetacije | Izvedeno |
| Ocjena zelenila mreže | duljinski ponderirana ocjena bridova | Izvedeno |
| Broj ruta / prijava | lokalna pohrana preglednika | Demo |

Pokazatelji kvalitete zraka namjerno nisu uključeni (skup D sadrži samo lokacije postaja).

## 5. GreenPlan — model prioriteta

Mreža ćelija **250 × 250 m** (EPSG:3765, ishodište zaokruženo na 250 m) unutar granice grada; zadržane ćelije s ≥ 50 % površine u gradu
(10 258 ćelija). Za svaku ćeliju pipeline računa:

| Polje | Opis |
|---|---|
| `green`, `park`, `open`, `built` | udjeli pokrova iz skupa A (`open` = šifre 4, 8, 12 — proxy nezapečaćenih površina i dvorišta) |
| `res`, `excl`, `lugreen` | udjeli planirane namjene iz skupa B |
| `dpark` | udaljenost središta ćelije do najbližeg spojenog poligona parka/šume (šifre 5, 6) ≥ 1 ha |
| `dgarden` | udaljenost središta ćelije do najbližeg gradskog vrta |

**Prihvatljive ćelije**: `res ≥ 0,25`, `excl < 0,5` (promet, infrastruktura, vode, groblja, posebna namjena), `built ≥ 0,2`
(postoji urbana struktura — isključuje oranice koje su samo planski predviđene za stanovanje).

**Čimbenici (0–1)**:

- manjak vegetacije `= 1 − min(green / 0,30, 1)`
- stambena namjena `= res`
- dostupnost parka `= min(dpark / 300 m, 1)` — prema pokazatelju WHO Europe (zelena površina ≥ 1 ha unutar 300 m zračne udaljenosti)
- dostupnost vrta `= min(dgarden / 1000 m, 1)`
- nezapečaćene površine `= min(open / 0,2, 1)` (proxy; vlasništvo i pogodnost nisu poznati)
- susjedstvo zelenila = udio od 8 susjednih ćelija s `green ≥ 0,3`

**Težine** (ponderirani prosjek, prikazane u sučelju):

- Sadnja drveća: manjak 0,35 · stambeno 0,25 · park 0,20 · otvorene površine 0,10 · susjedstvo 0,10
- Novi vrtovi: dostupnost vrta 0,40 · stambeno 0,30 · otvorene površine 0,20 · manjak 0,10

Sve kandidatske lokacije označene su kao **lokacije za provjeru** (vlasništvo, tlo, komunalni vodovi, planska ograničenja).

## 6. Simulator scenarija

| Scenarij | Postupak | Pokazatelj prije/poslije |
|---|---|---|
| 5 novih vrtova | pohlepni odabir najboljih ćelija s `dgarden ≥ 1 km`, međusobni razmak ≥ 1,5 km | Σ stambene površine (res × površina ćelije) čije je središte ≤ 1 km od vrta |
| 10 područja za sadnju | pohlepni odabir, razmak ≥ 500 m; korisnička pretpostavka *x* % ozelenjavanja `open` površina | prosječna vegetacija odabranih ćelija; broj prihvatljivih ćelija s < 10 % vegetacije |
| Zelena povezanost | zelene ćelije `green ≥ 0,3`, komponente 4-susjedstva; pohlepno dodavanje do 10 ćelija koje spajaju najviše različitih komponenti | broj zelenih cjelina, broj malih izoliranih cjelina (≤ 2 ćelije), najveća cjelina (km²) |

Scenariji su **hipotetski** i označeni kao simulacija. Aplikacija ne procjenjuje smanjenje temperature, onečišćenja, poplava
ni gubitka bioraznolikosti.

## 7. Validacija i testovi

- `pipeline/tests/test_pipeline.py` (pytest, 11 testova): transformacija WGS84 ↔ HTRS96/TM, duljina u projekciji vs. geodetska,
  odbijanje krivog CRS-a, popravak/odbacivanje neispravnih geometrija, nedostajuća datoteka/CRS, ocjena zelenila (0, 0,5, 1),
  prostorni spoj površina i dodjela zgrada po centroidu, dijeljenje OSM putova, povezane komponente.
- `src/lib/*.test.ts` (Vitest, 37 testova): formula troška, A\* (rubni slučajevi: ista točka, nepovezani graf, neispravni čvorovi),
  statistike rute, ograničenje obilaska, lijepljenje točaka, normalizacija i rangiranje GreenPlan čimbenika, scenariji,
  neuspjeh učitavanja podataka (HTTP, mreža, neispravan JSON/GeoJSON, nedostajuća geometrija), uklanjanje osobnih podataka iz prijava.
- Provjera geografije: sve ulazne granice nakon transformacije padaju unutar `fullExtent` servisa Grada Zagreba (EPSG:3765);
  ukupna mapirana površina 643,1 km² odgovara površini Grada.
