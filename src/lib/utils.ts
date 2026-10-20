/** Arrondi à 2 décimales (montants). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Nombre saisi dans un champ (virgule décimale acceptée) ; null si vide ou invalide. */
export function numberOrNull(value: string): number | null {
  const cleaned = value.replace(',', '.').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * UUID v4 (format attendu par les colonnes uuid de Postgres).
 * crypto.randomUUID n'existe pas hors HTTPS ou localhost : on passe alors par getRandomValues, disponible partout.
 */
export function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Identifiant unique (données locales, noms de fichiers). Toujours au format UUID. */
export function newId(): string {
  return newUuid();
}
