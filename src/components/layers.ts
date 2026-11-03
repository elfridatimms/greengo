export type LayerKey = 'vegetation' | 'landuse' | 'gardens' | 'air' | 'districts' | 'reports';

export const LAYER_LABELS: Record<LayerKey, string> = {
  vegetation: 'Mapirana vegetacija',
  landuse: 'Planirana namjena 2023',
  gardens: 'Gradski vrtovi',
  air: 'Postaje kvalitete zraka',
  districts: 'Gradske četvrti',
  reports: 'Prijave građana (demo)',
};

export type LayerState = Record<LayerKey, boolean>;
