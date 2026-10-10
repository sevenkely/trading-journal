import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isLightTheme, paletteRgb, readPalette, writePalette, type PaletteName } from '../lib/palette';

export interface PaletteValue {
  name: PaletteName;
  /** Triplet RVB du gain, pour rgb(${gainRgb} / alpha) */
  gainRgb: string;
  lossRgb: string;
  setName: (name: PaletteName) => void;
}

const DEFAULT_VALUE: PaletteValue = {
  name: 'classique',
  gainRgb: paletteRgb('classique', false).gain,
  lossRgb: paletteRgb('classique', false).loss,
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

/**
 * Le thème n’est pas un état React : il vit dans l’attribut data-theme de <html> (voir display.ts),
 * posé par les paramètres ou par le script du chargement. On s’y abonne pour que les teintes des
 * graphiques suivent immédiatement — sans quoi elles garderaient celles du thème précédent.
 */
function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const readTheme = (): string => (isLightTheme() ? 'light' : 'dark');
const serverTheme = (): string => 'dark';

/** Fournit la palette à toute l’app et l’applique via l’attribut data-palette de <html> (variables CSS). */
export function PaletteProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<PaletteName>(() => readPalette(localStorageOrNull()));

  useEffect(() => {
    document.documentElement.dataset.palette = name;
    writePalette(name, localStorageOrNull());
  }, [name]);

  // Les teintes suivent le thème : les mêmes triplets servent aux graphiques Recharts et aux barres dessinées à la main
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  const value = useMemo<PaletteValue>(() => {
    const rgb = paletteRgb(name, theme === 'light');
    return { name, gainRgb: rgb.gain, lossRgb: rgb.loss, setName };
  }, [name, theme]);
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

/** Palette courante ; sans fournisseur (tests isolés), renvoie la palette classique. */
export function usePalette(): PaletteValue {
  return useContext(PaletteContext) ?? DEFAULT_VALUE;
}
