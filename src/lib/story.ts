import type { MediaRole, TradeMedia, TradeVerdict } from './types';

/**
 * Le dossier de trade : les images sont rangées par rôle, dans l'ordre où le trade s'est décidé.
 * Contexte (HTF) → déclencheur (LTF) → résultat. Une galerie sans rôle ne se relit pas.
 */

export interface MediaRoleInfo {
  value: MediaRole;
  /** Libellé complet, pour le formulaire */
  label: string;
  /** Libellé court, pour les pastilles et les badges */
  short: string;
  /** Ce qu'on attend de cette image */
  hint: string;
}

export const MEDIA_ROLES: readonly MediaRoleInfo[] = [
  { value: 'htf', label: 'Contexte HTF', short: 'HTF', hint: 'Structure et biais sur H4 ou D1.' },
  { value: 'ltf', label: 'Déclencheur LTF', short: 'LTF', hint: 'L’entrée, sur M1 à M15.' },
  { value: 'result', label: 'Résultat', short: 'Résultat', hint: 'La sortie et ce que le marché a fait.' },
  { value: 'other', label: 'Autre', short: 'Autre', hint: 'Tout ce qui ne rentre pas ailleurs.' },
];

/** Ordre de lecture du dossier. */
export const STORY_ORDER: readonly MediaRole[] = ['htf', 'ltf', 'result', 'other'];

/** Les rôles qui font un dossier complet ; « autre » n'est jamais exigé. */
export const CORE_ROLES: readonly MediaRole[] = ['htf', 'ltf', 'result'];

export function roleInfo(role: MediaRole): MediaRoleInfo {
  return MEDIA_ROLES.find((r) => r.value === role) ?? MEDIA_ROLES[MEDIA_ROLES.length - 1];
}

export function isMediaRole(value: unknown): value is MediaRole {
  return typeof value === 'string' && MEDIA_ROLES.some((r) => r.value === value);
}

export function mediaOfRole(media: TradeMedia[], role: MediaRole): TradeMedia[] {
  return media.filter((m) => m.role === role);
}

/** Les images, regroupées par rôle et rangées dans l'ordre du récit ; les rôles vides sont omis. */
export function storyGroups(media: TradeMedia[]): { role: MediaRole; info: MediaRoleInfo; items: TradeMedia[] }[] {
  return STORY_ORDER.map((role) => ({ role, info: roleInfo(role), items: mediaOfRole(media, role) })).filter(
    (group) => group.items.length > 0,
  );
}

/** Résumé court : « 1 HTF · 2 LTF », ou « aucune image ». */
export function describeMedia(media: TradeMedia[]): string {
  if (media.length === 0) return 'aucune image';
  return STORY_ORDER.flatMap((role) => {
    const count = mediaOfRole(media, role).length;
    return count > 0 ? [`${count} ${roleInfo(role).short}`] : [];
  }).join(' · ');
}

/** Ce qui manque au dossier visuel, en libellés courts. */
export function missingStoryRoles(media: TradeMedia[]): MediaRole[] {
  return CORE_ROLES.filter((role) => !media.some((m) => m.role === role));
}

export function storyIsComplete(media: TradeMedia[]): boolean {
  return missingStoryRoles(media).length === 0;
}

/**
 * Où ranger une nouvelle image : l'emplacement libre du récit (contexte, puis déclencheur,
 * puis résultat), pour qu'un simple glisser-déposer suffise à ordonner le dossier.
 */
export function nextRole(media: TradeMedia[]): MediaRole {
  return CORE_ROLES.find((role) => !media.some((m) => m.role === role)) ?? 'other';
}

export interface VerdictInfo {
  value: TradeVerdict;
  label: string;
  hint: string;
  /** Sens de lecture pour les badges */
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}

export const VERDICTS: readonly VerdictInfo[] = [
  { value: 'played_out', label: 'Joué comme prévu', hint: 'Le scénario s’est déroulé sans écart.', tone: 'good' },
  { value: 'early_exit', label: 'Sorti trop tôt', hint: 'Le plan prévoyait d’aller plus loin.', tone: 'warn' },
  { value: 'late_exit', label: 'Sorti trop tard', hint: 'Objectif atteint, position gardée.', tone: 'warn' },
  { value: 'invalidated', label: 'Setup invalidé', hint: 'Le marché a contredit la thèse.', tone: 'neutral' },
  { value: 'no_plan', label: 'Sans plan', hint: 'Entrée d’impulsion, sans thèse écrite.', tone: 'bad' },
];

export function verdictInfo(verdict: TradeVerdict | null | undefined): VerdictInfo | null {
  if (!verdict) return null;
  return VERDICTS.find((v) => v.value === verdict) ?? null;
}

export function verdictLabel(verdict: TradeVerdict | null | undefined): string | null {
  return verdictInfo(verdict)?.label ?? null;
}

/** Une image est-elle renseignée par l’utilisateur (rôle, légende) ou juste déposée là ? */
export function mediaIsDescribed(media: TradeMedia): boolean {
  return Boolean(media.caption?.trim());
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Normalise `media` tel que la base ou un ancien stockage local peut le rendre :
 * on ignore ce qui n'a pas de chemin, on rabat un rôle inconnu sur « autre » et on
 * accepte l'ancien format (une simple chaîne de chemin).
 */
export function normalizeMedia(value: unknown, legacyScreenshots?: unknown): TradeMedia[] {
  const out: TradeMedia[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item) {
        out.push({ path: item, role: 'other', caption: null });
        continue;
      }
      if (!isObject(item) || typeof item.path !== 'string' || !item.path) continue;
      out.push({
        path: item.path,
        role: isMediaRole(item.role) ? item.role : 'other',
        caption: typeof item.caption === 'string' && item.caption.trim() ? item.caption : null,
      });
    }
  }
  // Ancien mode démo : `screenshots: string[]`, un emplacement par étape du récit
  if (out.length === 0 && Array.isArray(legacyScreenshots)) {
    legacyScreenshots.forEach((path, index) => {
      if (typeof path !== 'string' || !path) return;
      out.push({ path, role: STORY_ORDER[Math.min(index, STORY_ORDER.length - 1)], caption: null });
    });
  }
  return out;
}
