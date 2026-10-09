export type PaletteName = 'classique' | 'daltonien';

export const PALETTE_NAMES: PaletteName[] = ['classique', 'daltonien'];
export const PALETTE_STORAGE_KEY = 'tj-palette';

/**
 * Couleurs des gains et des pertes, en triplets RVB (pour rgb(… / alpha)).
 * « daltonien » : bleu et orange, lisibles avec les déficiences rouge-vert.
 * Les mêmes valeurs sont reprises en variables CSS dans index.css.
 */
export const PALETTES: Record<PaletteName, { gain: string; loss: string }> = {
  classique: { gain: '61 220 151', loss: '255 107 122' },
  daltonien: { gain: '86 180 233', loss: '232 116 59' },
};

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
