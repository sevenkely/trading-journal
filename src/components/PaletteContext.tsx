import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PALETTES, readPalette, writePalette, type PaletteName } from '../lib/palette';

export interface PaletteValue {
  name: PaletteName;
  /** Triplet RVB du gain, pour rgb(${gainRgb} / alpha) */
  gainRgb: string;
  lossRgb: string;
  setName: (name: PaletteName) => void;
}

const DEFAULT_VALUE: PaletteValue = {
  name: 'classique',
  gainRgb: PALETTES.classique.gain,
  lossRgb: PALETTES.classique.loss,
  setName: () => undefined,
};

const PaletteContext = createContext<PaletteValue | null>(null);

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Fournit la palette à toute l’app et l’applique via l’attribut data-palette de <html> (variables CSS). */
export function PaletteProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<PaletteName>(() => readPalette(localStorageOrNull()));

  useEffect(() => {
    document.documentElement.dataset.palette = name;
    writePalette(name, localStorageOrNull());
  }, [name]);

  const value = useMemo<PaletteValue>(
    () => ({ name, gainRgb: PALETTES[name].gain, lossRgb: PALETTES[name].loss, setName }),
    [name],
  );
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

/** Palette courante ; sans fournisseur (tests isolés), renvoie la palette classique. */
export function usePalette(): PaletteValue {
  return useContext(PaletteContext) ?? DEFAULT_VALUE;
}
