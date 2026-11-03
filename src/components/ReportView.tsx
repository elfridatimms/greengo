import { useState } from 'react';
import L from 'leaflet';
import { Panel, Badge } from './ui';
import { useMapLayer } from './useMapLayer';
import { useMapClick } from './mapContext';
import { REPORT_CATEGORIES } from '../data/reportCategories';
import {
  MAX_DESCRIPTION,
  deleteReport,
  getReports,
  saveReport,
  updateReportStatus,
  type EnvReport,
  type ReportCategory,
  type ReportStatus,
} from '../lib/storage';
import { preparePhoto } from '../lib/photo';
import { reward } from '../lib/gamification';

type Pt = { lat: number; lng: number };

const STATUS_LABEL: Record<ReportStatus, string> = {
  zaprimljeno: 'Zaprimljeno',
  'u-provjeri': 'U provjeri',
  rijeseno: 'Riješeno',
};

interface Props {
  onChange: (r: EnvReport[]) => void;
  onReward: (m: string) => void;
}

export default function ReportView({ onChange, onReward }: Props) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [loc, setLoc] = useState<Pt | null>(null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<EnvReport[]>(() => getReports());

  useMapClick(ll => setLoc({ lat: ll.lat, lng: ll.lng }));

  const refresh = () => {
    const r = getReports();
    setReports(r);
    onChange(r);
  };

  useMapLayer(
    () =>
      loc &&
      L.marker([loc.lat, loc.lng], {
        icon: L.divIcon({ className: 'route-pin route-pin--b', html: '<span>!</span>', iconSize: [30, 30], iconAnchor: [15, 15] }),
      }),
    true,
    [loc],
  );

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('Preglednik ne podržava geolokaciju.');
    navigator.geolocation.getCurrentPosition(
      p => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError('Lokacija nije dostupna. Odaberite mjesto klikom na kartu.'),
      { timeout: 8000 },
    );
  };

  const onPhoto = async (f: File | undefined) => {
    setError(null);
    if (!f) return setPhoto(undefined);
    try {
      setPhoto(await preparePhoto(f));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = () => {
    setError(null);
    if (!category) return setError('Odaberite kategoriju.');
    if (!loc) return setError('Odaberite lokaciju na karti.');
    if (description.trim().length < 5) return setError('Dodajte kratak opis (barem 5 znakova).');
    let saved = saveReport({ category, lat: loc.lat, lng: loc.lng, description, photo });
    if (!saved && photo) {
      // Storage quota is small; retry without the photo rather than losing the report.
      saved = saveReport({ category, lat: loc.lat, lng: loc.lng, description });
      if (saved) setError('Fotografija nije spremljena (premalo lokalne pohrane), prijava jest.');
    }
    if (!saved) return setError('Prijavu nije moguće spremiti (lokalna pohrana nedostupna).');
    const r = reward('report', 'first-report');
    onReward(`+${r.points} bodova${r.achievement ? ` · ${r.achievement.title}` : ''}`);
    setCategory(null);
    setDescription('');
    setPhoto(undefined);
    setLoc(null);
    refresh();
  };

  return (
    <Panel title="Prijavi okolišni problem" subtitle="Lokalni demo način">
      <div className="warning">
        <strong>Demo:</strong> prijave se spremaju samo u ovom pregledniku i <strong>ne prosljeđuju se Gradu Zagrebu</strong>. Ne unosite osobne
        podatke ni fotografije osoba ili registarskih oznaka. E-mail adrese i telefonski brojevi automatski se uklanjaju iz opisa.
      </div>

      <h2>1. Kategorija</h2>
      <div className="issue-grid">
        {REPORT_CATEGORIES.map(c => (
          <button key={c.id} type="button" className={`issue-btn${category === c.id ? ' is-active' : ''}`} onClick={() => setCategory(c.id)}>
            <span className="issue-emoji">{c.emoji}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <h2>2. Lokacija</h2>
      <p className="small">
        {loc ? `Odabrano: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'Kliknite na kartu za odabir lokacije.'}{' '}
        <button type="button" className="link" onClick={useMyLocation}>
          Koristi moju lokaciju
        </button>
      </p>

      <h2>3. Opis i fotografija</h2>
      <textarea
        value={description}
        maxLength={MAX_DESCRIPTION}
        onChange={e => setDescription(e.target.value)}
        placeholder="Npr. odbačen građevinski otpad uz rub parka"
        rows={3}
      />
      <div className="small muted">
        {description.length}/{MAX_DESCRIPTION}
      </div>
      <label className="file-input">
        Fotografija (neobavezno, JPEG/PNG/WebP do 10 MB — metapodaci se uklanjaju)
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onPhoto(e.target.files?.[0])} />
      </label>
      {photo && <img className="photo-preview" src={photo} alt="Pregled fotografije" />}

      {error && <p className="error">{error}</p>}
      <button type="button" className="btn-primary" onClick={submit}>
        Spremi prijavu
      </button>

      <h2>Moje prijave ({reports.length})</h2>
      <Badge kind="demo" />
      <ul className="report-list">
        {[...reports].reverse().map(r => {
          const c = REPORT_CATEGORIES.find(x => x.id === r.category);
          return (
            <li key={r.id}>
              <div>
                <strong>
                  {c?.emoji} {c?.label}
                </strong>
                <p>{r.description}</p>
                <span className="small muted">{new Date(r.timestamp).toLocaleString('hr-HR')}</span>
              </div>
              {r.photo && <img src={r.photo} alt="" />}
              <div className="report-actions">
                <select
                  value={r.status}
                  aria-label="Status (demo)"
                  onChange={e => {
                    updateReportStatus(r.id, e.target.value as ReportStatus);
                    refresh();
                  }}
                >
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    deleteReport(r.id);
                    refresh();
                  }}
                >
                  Obriši
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
