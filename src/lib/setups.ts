import type { Setup } from './types';

/**
 * Bibliothèque de setups. Un setup écrit en texte libre (« orb », « ORB », « Ouverture Range
 * Breakout ») ne se mesure pas : trois libellés pour un même motif font trois statistiques
 * de trois trades. La bibliothèque garde un nom, un contexte attendu et une condition
 * d'invalidation, puis le trade pointe vers elle.
 */

/** Nom tel qu'il sera enregistré et comparé : espaces réduits, longueur bornée. */
export function normalizeSetupName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Retrouve un setup par son nom, sans tenir compte de la casse ni des espaces superflus. */
export function findSetupByName(setups: Setup[], name: string | null | undefined): Setup | null {
  if (!name) return null;
  const wanted = normalizeSetupName(name).toLowerCase();
  if (!wanted) return null;
  return setups.find((s) => normalizeSetupName(s.name).toLowerCase() === wanted) ?? null;
}

/**
 * Rattache un trade à la bibliothèque. Le libellé `setup` reste la source des tableaux et des
 * filtres (il fonctionne aussi pour les trades importés), `setup_id` est le lien qui permettra
 * de mesurer un setup à travers les trades.
 */
export function resolveSetupRef(
  setups: Setup[],
  ref: { setup_id?: string | null; setup?: string | null },
): { setup_id: string | null; setup: string | null } {
  const byId = ref.setup_id ? (setups.find((s) => s.id === ref.setup_id) ?? null) : null;
  if (byId) return { setup_id: byId.id, setup: byId.name };
  const label = normalizeSetupName(ref.setup ?? '') || null;
  const byName = findSetupByName(setups, label);
  return { setup_id: byName?.id ?? null, setup: byName?.name ?? label };
}

/** Un nom déjà pris dans la bibliothèque ? (la base l'interdit, autant le dire avant l'envoi) */
export function setupNameTaken(setups: Setup[], name: string, ignoreId?: string): boolean {
  const wanted = normalizeSetupName(name).toLowerCase();
  return setups.some((s) => s.id !== ignoreId && normalizeSetupName(s.name).toLowerCase() === wanted);
}

/** Nombre de points de checklist communs entre le setup et le trade : « 3 / 4 points du setup ». */
export function checklistMatch(setup: Setup | null, done: string[]): { checked: number; total: number } | null {
  if (!setup || setup.checklist.length === 0) return null;
  const set = new Set(done.map((item) => item.toLowerCase()));
  return {
    checked: setup.checklist.filter((item) => set.has(item.toLowerCase())).length,
    total: setup.checklist.length,
  };
}
