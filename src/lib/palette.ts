export type PaletteName = 'classique' | 'daltonien';

export const PALETTE_NAMES: PaletteName[] = ['classique', 'daltonien'];
export const PALETTE_STORAGE_KEY = 'tj-palette';

export interface PaletteRgb {
  gain: string;
  loss: string;
}

/**
 * Couleurs des gains et des pertes, en triplets RVB (pour rgb(… / alpha)).
 * « daltonien » : bleu et orange, lisibles avec les déficiences rouge-vert.
 * Deux jeux par palette, comme dans index.css : le thème clair a besoin de teintes plus foncées
 * pour rester lisible sur blanc (contraste vérifié dans src/test/chartPalette.test.ts).
 */
export const PALETTES: Record<PaletteName, PaletteRgb & { gainLight: string; lossLight: string }> = {
  classique: { gain: '61 220 151', loss: '255 107 122', gainLight: '10 125 67', lossLight: '192 57 43' },
  daltonien: { gain: '86 180 233', loss: '232 116 59', gainLight: '23 105 170', lossLight: '184 86 15' },
};

/**
 * Couleurs de gain et de perte du thème demandé.
 * Recharts et les barres dessinées à la main reçoivent ces triplets : ils lisent document au rendu,
 * comme chartPalette() — le thème ne change que dans les paramètres, une lecture au rendu suffit.
 */
export function paletteRgb(name: PaletteName, light: boolean): PaletteRgb {
  const palette = PALETTES[name];
  return light ? { gain: palette.gainLight, loss: palette.lossLight } : { gain: palette.gain, loss: palette.loss };
}

/** Le thème clair est appliqué par data-theme="light" sur <html> (voir display.ts). */
export function isLightTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
}

export const PALETTE_LABELS: Record<PaletteName, string> = {
  classique: 'Vert / rouge',
  daltonien: 'Bleu / orange',
};

export function isPaletteName(value: unknown): value is PaletteName {
  return value === 'classique' || value === 'daltonien';
}

/** Lit le réglage enregistré ; retombe sur « classique » si absent, invalide ou stockage indisponible. */
export function readPalette(storage: Pick<Storage, 'getItem'> | null | undefined): PaletteName {
  try {
    const raw = storage?.getItem(PALETTE_STORAGE_KEY);
    return isPaletteName(raw) ? raw : 'classique';
  } catch {
    return 'classique';
  }
}

export function writePalette(name: PaletteName, storage: Pick<Storage, 'setItem'> | null | undefined): void {
  try {
    storage?.setItem(PALETTE_STORAGE_KEY, name);
  } catch {
    // Stockage indisponible (navigation privée) : le réglage vaut pour la session
  }
}
