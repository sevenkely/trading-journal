/**
 * Palette des graphiques. Recharts reçoit des couleurs en dur (il ne lit pas les variables CSS) :
 * la palette est choisie au rendu selon le thème (attribut data-theme="light" pour le thème clair).
 * Chaque graphique est monté sur sa page ; le thème ne change que dans les paramètres, donc une lecture au rendu suffit.
 */
export interface ChartPalette {
  axis: string;
  grid: string;
  cursor: string;
  equity: string;
  limit: string;
  target: string;
  neutral: string;
  /** Fond du pinceau et des zones de tracé */
  surface: string;
  /** Contour des points et des marqueurs */
  marker: string;
  /** Libellés (Max, Min, moyenne) */
  text: string;
  cursorFill: string;
  limitFill: string;
}

const DARK_PALETTE: ChartPalette = {
  axis: '#7d8899',
  grid: '#1b2433',
  cursor: '#334056',
  equity: '#f2b84b',
  limit: '#ff6b7a',
  target: '#3ddc97',
  neutral: '#7d8899',
  surface: '#0d1118',
  marker: '#0d1118',
  text: '#eef2f8',
  cursorFill: 'rgb(255 255 255 / 0.03)',
  limitFill: 'rgb(255 107 122 / 0.22)',
};

/** Couleurs du thème clair : contrastes vérifiés dans src/test/chartPalette.test.ts. */
const LIGHT_PALETTE: ChartPalette = {
  axis: '#5b6575',
  grid: '#dde2ea',
  cursor: '#9aa4b5',
  equity: '#9a6200',
  limit: '#c0392b',
  target: '#0a7d43',
  neutral: '#5b6575',
  surface: '#eef1f6',
  marker: '#ffffff',
  text: '#1d2330',
  cursorFill: 'rgb(0 0 0 / 0.04)',
  limitFill: 'rgb(192 57 43 / 0.16)',
};

export function chartPalette(): ChartPalette {
  return document.documentElement.dataset.theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}

export function axisTick(): { fill: string; fontSize: number } {
  return { fill: chartPalette().axis, fontSize: 11 };
}

/** Hachures des pertes : l’information ne repose pas sur la seule couleur (daltonisme). */
export const LOSS_HATCH = 'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.28) 0 2px, transparent 2px 6px)';
