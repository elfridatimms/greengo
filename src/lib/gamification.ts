import { addPoints, getAchievements, getPoints, unlockAchievement } from './storage';

export const POINTS = {
  greenRoute: 20,
  report: 15,
  visitGarden: 10,
  lesson: 5,
} as const;

export interface Achievement {
  id: string;
  title: string;
  description: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-green-route', title: 'Prva zelena ruta', description: 'Izračunali ste zeleniju pješačku rutu.' },
  { id: 'first-report', title: 'Budno oko', description: 'Prijavili ste okolišni problem (lokalni demo).' },
  { id: 'garden-explorer', title: 'Istraživač vrtova', description: 'Otvorili ste podatke o gradskom vrtu.' },
  { id: 'learner', title: 'Poznavatelj zelenila', description: 'Pročitali ste sve edukativne kartice.' },
  { id: 'planner', title: 'Zeleni planer', description: 'Pokrenuli ste scenarij u GreenPlanu.' },
];

export interface RewardEvent {
  points: number;
  achievement: Achievement | null;
  total: number;
}

export function reward(kind: keyof typeof POINTS, achievementId?: string): RewardEvent {
  const total = addPoints(POINTS[kind]);
  const unlocked = achievementId ? unlockAchievement(achievementId) : false;
  return {
    points: POINTS[kind],
    achievement: unlocked ? ACHIEVEMENTS.find(a => a.id === achievementId) ?? null : null,
    total,
  };
}

export function unlockOnly(achievementId: string): Achievement | null {
  return unlockAchievement(achievementId) ? ACHIEVEMENTS.find(a => a.id === achievementId) ?? null : null;
}

export function summary() {
  return { points: getPoints(), achievements: getAchievements() };
}

/** Short educational cards; facts refer to the datasets used in the app. */
export const LESSONS = [
  {
    id: 'lulc',
    title: 'Što je "mapirana vegetacija"?',
    body:
      'U ovoj aplikaciji to su livade, voćnjaci i vinogradi, parkovi, šume i šikare iz Topografske osnove Grada Zagreba. Skup sadrži poligone pokrova zemljišta, a ne pojedinačna stabla, pa drvoredi uz ulice nisu zasebno prikazani.',
  },
  {
    id: 'date',
    title: 'Koliko su podaci svježi?',
    body:
      'Većina poligona potječe iz aerofotogrametrijskog i LiDAR snimanja 2012., a dio je ažuriran snimanjem 2018. Stvarno stanje danas može se razlikovati.',
  },
  {
    id: 'proxy',
    title: 'Zelenija ruta ≠ hladnija ruta',
    body:
      'Ocjena zelenila mjeri koliki je dio pojasa uz put pod mapiranom vegetacijom. To nije mjerenje hlada, temperature ni kvalitete zraka.',
  },
  {
    id: 'gardens',
    title: 'Gradski vrtovi',
    body:
      'Grad Zagreb objavljuje lokacije gradskih vrtova s brojem vrtnih parcela. GreenPlan računa koliki je udio stambenih površina unutar 1 km od vrta.',
  },
  {
    id: 'air',
    title: 'Mjerne postaje kvalitete zraka',
    body:
      'Na karti su lokacije gradskih mjernih postaja. Iz lokacije postaje ne može se zaključiti kakva je kvaliteta zraka u pojedinoj ulici, pa aplikacija ne prikazuje procjene onečišćenja.',
  },
];
