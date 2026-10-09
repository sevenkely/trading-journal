import { useSyncExternalStore } from 'react';

/**
 * Suppression différée : le trade disparaît tout de suite de l’écran, la suppression part après UNDO_DELAY_MS,
 * sauf annulation. L’état vit hors des composants : une navigation ne l’interrompt pas.
 * Si la page est fermée avant la fin du délai, rien n’est supprimé (échec sans perte).
 */

export const UNDO_DELAY_MS = 6000;

interface Pending {
  ids: string[];
  timer: ReturnType<typeof setTimeout>;
  started: boolean;
  commit: () => Promise<void>;
}

const pending = new Map<number, Pending>();
let seq = 0;
let hidden: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function publish(): void {
  const ids = new Set<string>();
  pending.forEach((entry) => entry.ids.forEach((id) => ids.add(id)));
  hidden = ids;
  listeners.forEach((listener) => listener());
}

/** Planifie la suppression ; renvoie la fonction qui l’annule (sans effet une fois la suppression lancée). */
export function scheduleDeletion(ids: string[], commit: () => Promise<void>, delay = UNDO_DELAY_MS): () => void {
  const token = ++seq;
  const entry: Pending = {
    ids,
    started: false,
    commit,
    timer: setTimeout(() => {
      entry.started = true;
      // L’appelant gère ses erreurs ; ici on libère seulement l’état masqué une fois la suppression terminée
      void commit()
        .catch(() => undefined)
        .finally(() => {
          pending.delete(token);
          publish();
        });
    }, delay),
  };
  pending.set(token, entry);
  publish();
  return () => {
    if (entry.started || !pending.has(token)) return;
    clearTimeout(entry.timer);
    pending.delete(token);
    publish();
  };
}

export function getHiddenIds(): ReadonlySet<string> {
  return hidden;
}

/** Identifiants masqués en attente de suppression, réactifs. */
export function useHiddenIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getHiddenIds,
    getHiddenIds,
  );
}
