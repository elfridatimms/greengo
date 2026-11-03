# GreenGo Zagreb — prijava za Datathon otvorenih podataka 2026

**Izazov B: Okoliš i održivi prostor** · Istraži, zaštiti, obnovi

## Problem

Grad Zagreb objavljuje vrijedne prostorne podatke — kartu vegetacije i vrsta zemljišta, planiranu namjenu, gradske vrtove —
ali u obliku stotina megabajta GIS datoteka koje građani i većina donositelja odluka ne mogu izravno koristiti. Ne postoji
jednostavan način da se odgovori na pitanja: *Kojim putem mogu pješačiti uz više zelenila? Koje četvrti imaju najmanje
mapirane vegetacije? Gdje bi nova sadnja ili gradski vrt najviše pomogli stanovnicima?*

## Rješenje

GreenGo Zagreb je web platforma koja **povezuje četiri skupa podataka Grada Zagreba s data.gov.hr i OpenStreetMap** kroz
reproducibilni prostorni pipeline i pretvara ih u četiri alata:

1. **Zelene pješačke rute** — za svaki od 66 565 segmenata pješačke mreže središnjeg Zagreba izračunat je udio pojasa ±20 m
   pod mapiranom vegetacijom. A\* algoritam uspoređuje najkraću i zeleniju rutu uz korisnički zadano maksimalno produljenje.
   Primjer: Glavni kolodvor → Park Maksimir — zelenija ruta je 227 m (6 %) duža, a udio duljine uz vegetaciju raste s 24 % na 51 %.
2. **GreenPulse** — udio mapirane vegetacije po 17 gradskih četvrti (od 15 % u Donjem gradu i Trešnjevci-sjever do 89 %
   u Podsljemenu), struktura pokrova, dostupnost gradskih vrtova (samo 9,8 % stambenih površina unutar je 1 km od gradskog vrta).
3. **GreenPlan** — transparentni model prioriteta na mreži ćelija 250 m koji kombinira manjak vegetacije, stambenu namjenu,
   udaljenost od parka ≥ 1 ha (WHO pokazatelj 300 m), udaljenost od vrta, nezapečaćene površine i susjedstvo zelenila.
   Simulator scenarija: npr. 5 novih vrtova na modelom predloženim lokacijama povećalo bi stambene površine unutar 1 km
   od vrta s 11,9 na 19,7 km² (ćelijska aproksimacija).
4. **Prijave** — građani bilježe divlji otpad, oštećena stabla i probleme u parkovima (demo način, lokalna pohrana).

## Korišteni otvoreni podaci (svi preuzeti i obrađeni, ne samo navedeni)

| Skup (data.gov.hr) | Izdavatelj | Utjecaj na rezultate |
|---|---|---|
| Topografska osnova 2018. Vegetacija i vrste zemljišta | Grad Zagreb | Ocjena zelenila ruta, svi pokazatelji vegetacije, GreenPlan |
| Geoportal planirana namjena 2023 | Grad Zagreb | Stambena namjena i isključenja u GreenPlanu, dostupnost vrtova |
| Geoportal gradski vrt | Grad Zagreb | Dostupnost vrtova, scenarij novih vrtova |
| Gradske četvrti | Grad Zagreb | Agregacija GreenPulse pokazatelja |
| Geoportal Kvaliteta zraka | Grad Zagreb | Lokacije mjernih postaja (bez izmišljanja mjerenja) |
| OpenStreetMap | OSM suradnici | Pješački graf |

Provjera za ocjenjivače: `data/raw/manifest.json` (URL + SHA-256), `public/data/pipeline_report.json` (validacija),
`pipeline/build_all.py` (sav izračun), [DATA_SOURCES.md](DATA_SOURCES.md).

## Inovativnost

- Spoj **pješačkog grafa i službene karte pokrova zemljišta** na razini pojedinog segmenta ulice — rutiranje temeljeno na
  javnim podacima Grada, a ne na komercijalnim API-jima.
- **Objašnjiv model** umjesto "crne kutije": svaka ocjena rastavljena je na čimbenike s prikazanim težinama.
- **Poštenje prema podacima**: svaka brojka nosi oznaku (iz skupa / izvedeno / simulacija / demo) i izvor s datumom; aplikacija
  ne tvrdi ništa o temperaturi, hladu ili onečišćenju što podaci ne podržavaju.
- Potpuno **statička arhitektura** — bez poslužitelja, bez troškova održavanja, lako preuzimanje od strane Grada.

## Ciljani korisnici

- **Građani** — pješaci, roditelji, starije osobe koji biraju ugodnije pješačke putove.
- **Gradski uredi i Zavod za prostorno uređenje** — brzi pregled gdje provjeriti mogućnosti sadnje i novih gradskih vrtova.
- **Vijeća gradskih četvrti i udruge** — argumentirani prijedlozi za ozelenjavanje svoje četvrti.
- **Novinari i istraživači** — reproducibilni pokazatelji iz otvorenih podataka.

## Učinak

- Čini 330 tisuća poligona vegetacije razumljivima u nekoliko klikova.
- Daje mjerljive, provjerljive pokazatelje (udio vegetacije, dostupnost vrtova) za praćenje promjena kad Grad objavi nove verzije skupova.
- Usmjerava terenske provjere na manji broj prioritetnih lokacija umjesto nasumičnog pretraživanja.

## Ograničenja (iskreno)

- Vegetacijski podaci su iz 2012. (dio ažuriran 2018.) i ne sadrže pojedinačna stabla ni drvorede.
- Rutiranje pokriva središnji Zagreb (≈ 8 × 6 km).
- Planirana namjena nije stvarno korištenje niti dozvola; kandidatske lokacije zahtijevaju provjeru vlasništva, tla, vodova i planova.
- Prijave su lokalni demo, ne šalju se Gradu.
- Copernicus Tree Cover Density nije integriran.

## Budući razvoj

1. Integracija Copernicus Tree Cover Density / urbanog stabalnog katastra za drvorede.
2. Rutiranje za cijeli grad (vektorske pločice / WebAssembly).
3. Povezivanje prijava sa sustavom Grada (npr. postojeći kanali komunalnih prijava) uz moderaciju.
4. Demografski sloj (popis stanovništva 2021. po prostornim jedinicama) za ponderiranje prema broju stanovnika.
5. Usporedba verzija skupova kroz vrijeme (promjene vegetacije).

## Tim, kod i licence

Izvorni kod: MIT licenca; obrađeni podaci pod licencama izvora (OD, CC BY 4.0, ODbL). Tehnička dokumentacija:
[README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [METHODOLOGY.md](METHODOLOGY.md).
