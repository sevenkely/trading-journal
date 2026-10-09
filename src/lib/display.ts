/** Préférences d’affichage de cet appareil : densité des tableaux et thème. */

export type Density = 'confortable' | 'compact';
export type Theme = 'sombre' | 'clair';

export interface DisplayPrefs {
  density: Density;
  theme: Theme;
}

export const DENSITY_KEY = 'tj-density';
export const THEME_KEY = 'tj-theme';

export const DISPLAY_DEFAULTS: DisplayPrefs = { density: 'confortable', theme: 'sombre' };

/** localStorage, ou null si le navigateur le refuse (mode privé strict, cookies bloqués). */
export function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readDisplayPrefs(storage: Pick<Storage, 'getItem'> | null): DisplayPrefs {
  return {
    density: storage?.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'confortable',
    theme: storage?.getItem(THEME_KEY) === 'clair' ? 'clair' : 'sombre',
  };
}

export function writeDisplayPrefs(prefs: DisplayPrefs, storage: Pick<Storage, 'setItem'> | null): void {
  storage?.setItem(DENSITY_KEY, prefs.density);
  storage?.setItem(THEME_KEY, prefs.theme);
}

/** Traduit les préférences en attributs de <html>, lus par index.css. Le thème sombre est celui par défaut. */
export function applyDisplayPrefs(prefs: DisplayPrefs, root: HTMLElement): void {
  if (prefs.density === 'compact') root.dataset.density = 'compact';
  else delete root.dataset.density;
  if (prefs.theme === 'clair') root.dataset.theme = 'light';
  else delete root.dataset.theme;
}
