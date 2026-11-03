/** Provenance metadata shown in the UI. Verified against the data.gov.hr CKAN API on 2026-11-03. */
export interface DataSource {
  id: string;
  name: string;
  publisher: string;
  url: string;
  license: string;
  referenceDate: string;
  usedFor: string;
}

export const SOURCES: Record<string, DataSource> = {
  vegetacija: {
    id: 'vegetacija',
    name: 'Topografska osnova 2018. Vegetacija i vrste zemljišta',
    publisher: 'Grad Zagreb',
    url: 'https://data.gov.hr/ckan/en/dataset/topografska-osnova-2018-vegetacija-i-vrste-zemljista',
    license: 'Otvorena dozvola (OD)',
    referenceDate: 'Snimanje 2012. (aerofoto + LiDAR), ažurirano aerofoto snimanjem 2018.',
    usedFor: 'Sloj vegetacije, ocjena zelenila pješačkih segmenata, udio zelenila po četvrtima i ćelijama',
  },
  namjena: {
    id: 'namjena',
    name: 'Geoportal planirana namjena 2023',
    publisher: 'Grad Zagreb',
    url: 'https://data.gov.hr/ckan/en/dataset/geoportal-planirana-namjena-2023',
    license: 'Otvorena dozvola (OD)',
    referenceDate: '2023 (prostorni planovi s izmjenama 1998.–2020.)',
    usedFor: 'Sloj namjene, stambena namjena i isključenja u GreenPlan analizi, dostupnost vrtova',
  },
  vrtovi: {
    id: 'vrtovi',
    name: 'Geoportal gradski vrt',
    publisher: 'Grad Zagreb',
    url: 'https://data.gov.hr/ckan/en/dataset/geoportal-gradski-vrt',
    license: 'Creative Commons Imenovanje 4.0 (CC BY 4.0)',
    referenceDate: 'Resurs ažuriran 2023-02-01',
    usedFor: 'Lokacije gradskih vrtova, analiza dostupnosti, scenarij novih vrtova',
  },
  zrak: {
    id: 'zrak',
    name: 'Geoportal Kvaliteta zraka',
    publisher: 'Grad Zagreb',
    url: 'https://data.gov.hr/ckan/hr/dataset/geoportal-kvaliteta-zraka',
    license: 'Otvorena dozvola (OD)',
    referenceDate: 'Resurs ažuriran 2023-04-04',
    usedFor: 'Samo lokacije mjernih postaja (bez mjerenja)',
  },
  cetvrti: {
    id: 'cetvrti',
    name: 'Gradske četvrti — prostorna jedinica mjesne samouprave',
    publisher: 'Grad Zagreb',
    url: 'https://data.gov.hr/ckan/hr/dataset/gradske-cetvrti-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba',
    license: 'Otvorena dozvola (OD)',
    referenceDate: '2025-02-03',
    usedFor: 'Agregacija pokazatelja po 17 gradskih četvrti',
  },
  osm: {
    id: 'osm',
    name: 'OpenStreetMap — pješačka mreža',
    publisher: 'OpenStreetMap suradnici',
    url: 'https://www.openstreetmap.org/copyright',
    license: 'ODbL 1.0',
    referenceDate: 'Overpass preuzimanje 2026-11-03',
    usedFor: 'Graf pješačke mreže za rutiranje (središnji Zagreb)',
  },
};

/** How a value was obtained — shown as a badge next to every metric. */
export type Provenance = 'izmjereno' | 'izvedeno' | 'procjena' | 'demo';

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  izmjereno: 'Iz skupa podataka',
  izvedeno: 'Izvedeno prostornom analizom',
  procjena: 'Simulacija / pretpostavka',
  demo: 'Lokalni demo podatak',
};

export const LULC_LABELS: Record<number, string> = {
  1: 'Oranica',
  2: 'Livada',
  3: 'Voćnjaci i vinogradi',
  4: 'Neobradivo',
  5: 'Park',
  6: 'Šuma',
  7: 'Šikara',
  8: 'Neplodno zemljište',
  9: 'Izgrađeno — javne površine',
  10: 'Izgrađeno — gospodarske',
  11: 'Izgrađeno — prometne',
  12: 'Dvorište',
  13: 'Objekti (zgrade)',
  14: 'Groblje',
  15: 'Intenzivna gospodarska djelatnost',
  16: 'Posebna namjena',
};

export const VEG_COLORS: Record<number, string> = {
  2: '#a9d18e',
  3: '#d6c96b',
  5: '#5fb35a',
  6: '#2f7d32',
  7: '#86b86a',
};

export const LANDUSE_COLORS: Record<string, string> = {
  'Stambena i mješovita namjena': '#f2c48d',
  'Mješovita namjena': '#f2c48d',
  'Pretežito stambena namjena': '#f2c48d',
  'Javna i društvena namjena': '#e79b8f',
  'Gospodarska namjena': '#b9a5d6',
  'Poslovna namjena': '#c5b3e0',
  'Proizvodna namjena': '#a08cc6',
  'Prometne površine': '#bdbdbd',
  Infrastruktura: '#9e9e9e',
  'Javne zelene površine': '#7cc576',
  'Zaštitne zelene površine': '#b5dca5',
  Šume: '#3f8f3f',
  'Sport i rekreacija': '#8fd3c8',
  'Vode i vodno dobro': '#8ec5ea',
  Groblje: '#8a8a6a',
  'Posebna namjena': '#777777',
};
