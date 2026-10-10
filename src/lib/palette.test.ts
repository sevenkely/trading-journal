import { describe, expect, it } from 'vitest';
import { PALETTES, PALETTE_NAMES, PALETTE_STORAGE_KEY, isPaletteName, paletteRgb, readPalette, writePalette } from './palette';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

describe('palette', () => {
  it('lit le réglage enregistré et retombe sur « classique » sinon', () => {
    expect(readPalette(memoryStorage())).toBe('classique');
    expect(readPalette(memoryStorage({ [PALETTE_STORAGE_KEY]: 'daltonien' }))).toBe('daltonien');
    expect(readPalette(memoryStorage({ [PALETTE_STORAGE_KEY]: 'n-importe-quoi' }))).toBe('classique');
    expect(readPalette(null)).toBe('classique');
  });

  it('enregistre le choix, et ne plante pas si le stockage est indisponible', () => {
    const store = memoryStorage();
    writePalette('daltonien', store);
    expect(store.data.get(PALETTE_STORAGE_KEY)).toBe('daltonien');
    expect(() => writePalette('classique', null)).not.toThrow();
  });

  it('reconnaît les noms valides et fournit deux paires de couleurs distinctes', () => {
    expect(isPaletteName('classique')).toBe(true);
    expect(isPaletteName('vert')).toBe(false);
    expect(PALETTES.daltonien.gain).not.toBe(PALETTES.classique.gain);
    expect(PALETTES.daltonien.loss).not.toBe(PALETTES.classique.loss);
  });

  it('sert les teintes du thème demandé, sans dépendre du thème courant', () => {
    for (const name of PALETTE_NAMES) {
      expect(paletteRgb(name, false)).toEqual({ gain: PALETTES[name].gain, loss: PALETTES[name].loss });
      expect(paletteRgb(name, true)).toEqual({ gain: PALETTES[name].gainLight, loss: PALETTES[name].lossLight });
    }
  });
});
