const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = dayFormatters.get(tz);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    dayFormatters.set(tz, formatter);
  }
  return formatter;
}

/** Clé de journée YYYY-MM-DD dans un fuseau donné. */
export function dayKey(input: string | Date, tz: string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  const parts = dayFormatter(tz).formatToParts(d);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** Intl sépare les milliers par une espace fine insécable (U+202F), mal rendue par certaines polices : on utilise l’espace insécable standard. */
const fixSpaces = (text: string): string => text.replace(/\u202f/g, '\u00a0');

export function formatMoney(value: number | null | undefined, currency = 'USD', signed = false): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return fixSpaces(new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value));
}

export function formatNumber(value: number | null | undefined, maxDigits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return fixSpaces(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: maxDigits }).format(value));
}

/** Valeur déjà exprimée en pourcentage (ex. 45.5 → « 45,5 % »). */
export function formatPercent(value: number | null | undefined, maxDigits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, maxDigits)} %`;
}

export function formatProfitFactor(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value === Infinity) return '∞';
  return formatNumber(value, 2);
}

export function formatR(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${formatNumber(value, 2)} R`;
}

export function formatDateTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDate(input: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('fr-FR', options ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** Couleur d’un montant : jetons de l’app (gain, perte), donc suivent la palette choisie. */
export function signClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return 'text-fg-2';
  return value > 0 ? 'text-gain' : 'text-loss';
}

/** Symbole de direction : ▲ gain, ▼ perte, rien pour zéro. Complète la couleur, sans la remplacer. */
export function pnlGlyph(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return '';
  return value > 0 ? '▲' : '▼';
}

/** Montant signé sans décimales ni devise, pour les étiquettes de graphique : « +1 672 ». */
export function formatSignedCompact(value: number): string {
  return fixSpaces(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0, signDisplay: 'exceptZero' }).format(value));
}

/** ISO → valeur pour <input type="datetime-local"> (heure du navigateur). */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valeur de <input type="datetime-local"> → ISO (heure du navigateur). */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function monthKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** Majuscule en tête seulement : « lundi 5 oct. » → « Lundi 5 oct. » (le CSS « capitalize » abîmerait « oct. »). */
export function capFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1);
}


/** Durée lisible, sans secondes : « < 1 min », « 45 min », « 1 h 12 min », « 2 j 3 h ». */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  return `${Math.floor(hours / 24)} j ${hours % 24} h`;
}
