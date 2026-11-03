import type { ReportCategory } from '../lib/storage';

export const REPORT_CATEGORIES: { id: ReportCategory; label: string; emoji: string }[] = [
  { id: 'otpad', label: 'Divlji otpad ili vidljivo smeće', emoji: '🗑️' },
  { id: 'stablo', label: 'Oštećeno stablo', emoji: '🌳' },
  { id: 'vegetacija', label: 'Uništena vegetacija', emoji: '🥀' },
  { id: 'park', label: 'Problem u parku', emoji: '🏞️' },
  { id: 'infrastruktura', label: 'Oštećena okolišna infrastruktura', emoji: '🚧' },
];
