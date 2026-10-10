import { dayKey } from './format';
import { isOpen, tradeTime } from './metrics';
import { newId } from './utils';
import type { Trade } from './types';

/** Lignes par page dans le tableau des trades (pagination, sans virtualisation). */
export const PAGE_SIZE = 50;
export const MAX_VIEWS = 12;

export const OUTCOMES = ['all', 'win', 'loss', 'be'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const SIDES = ['all', 'long', 'short'] as const;
export type Side = (typeof SIDES)[number];
export const PLANS = ['all', 'yes', 'no'] as const;
export type PlanFilter = (typeof PLANS)[number];
export const STATES = ['all', 'open', 'closed'] as const;
export type StateFilter = (typeof STATES)[number];
export const SORT_KEYS = ['opened', 'instrument', 'size', 'pnl', 'r', 'setup'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const DIRS = ['asc', 'desc'] as const;
export type SortDir = (typeof DIRS)[number];

/** État du tableau : entièrement porté par l’URL (filtres, tri, page). */
export interface TradeQuery {
  account: string;
  outcome: Outcome;
  side: Side;
  plan: PlanFilter;
  /** open = positions encore ouvertes (P&L flottant), closed = trades clôturés */
  state: StateFilter;
  q: string;
  /** Dates au format AAAA-MM-JJ, jour de trading dans le fuseau du navigateur ; vide = pas de borne. */
  from: string;
  to: string;
  sort: SortKey;
  dir: SortDir;
  page: number;
}

export const DEFAULT_QUERY: TradeQuery = {
  account: 'all',
  outcome: 'all',
  side: 'all',
  plan: 'all',
  state: 'all',
  q: '',
  from: '',
  to: '',
  sort: 'opened',
  dir: 'desc',
  page: 1,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Lit la requête depuis l’URL ; toute valeur inconnue revient à la valeur par défaut. */
export function parseTradeQuery(params: URLSearchParams): TradeQuery {
  const date = (key: string): string => {
    const value = params.get(key) ?? '';
    return DATE_RE.test(value) ? value : '';
  };
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    account: params.get('account') || 'all',
    outcome: oneOf(params.get('outcome'), OUTCOMES, DEFAULT_QUERY.outcome),
    side: oneOf(params.get('side'), SIDES, DEFAULT_QUERY.side),
    plan: oneOf(params.get('plan'), PLANS, DEFAULT_QUERY.plan),
    state: oneOf(params.get('state'), STATES, DEFAULT_QUERY.state),
    q: params.get('q') ?? '',
    from: date('from'),
    to: date('to'),
    sort: oneOf(params.get('sort'), SORT_KEYS, DEFAULT_QUERY.sort),
    dir: oneOf(params.get('dir'), DIRS, DEFAULT_QUERY.dir),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Écrit la requête dans l’URL : seules les valeurs différentes du défaut sont gardées, les autres paramètres (ex. ?trade=) aussi. */
export function writeTradeQuery(prev: URLSearchParams, query: TradeQuery): URLSearchParams {
  const next = new URLSearchParams(prev);
  const entries: [string, string, string][] = [
    ['account', query.account, DEFAULT_QUERY.account],
    ['outcome', query.outcome, DEFAULT_QUERY.outcome],
    ['side', query.side, DEFAULT_QUERY.side],
    ['plan', query.plan, DEFAULT_QUERY.plan],
    ['state', query.state, DEFAULT_QUERY.state],
    ['q', query.q, DEFAULT_QUERY.q],
    ['from', query.from, DEFAULT_QUERY.from],
    ['to', query.to, DEFAULT_QUERY.to],
    ['sort', query.sort, DEFAULT_QUERY.sort],
    ['dir', query.dir, DEFAULT_QUERY.dir],
    ['page', String(query.page), String(DEFAULT_QUERY.page)],
  ];
  for (const [key, value, fallback] of entries) {
    next.delete(key);
    if (value !== fallback) next.set(key, value);
  }
  return next;
}

/** Requête sans page ni trade ouvert, pour enregistrer une vue. */
export function tradeQueryString(query: TradeQuery): string {
  return writeTradeQuery(new URLSearchParams(), { ...query, page: 1 }).toString();
}

/** Filtre les trades ; `hidden` = trades en attente de suppression (masqués tout de suite). */
export function filterTrades(trades: readonly Trade[], query: TradeQuery, tz: string, hidden: ReadonlySet<string> = new Set()): Trade[] {
  const q = query.q.trim().toLowerCase();
  return trades.filter((t) => {
    if (hidden.has(t.id)) return false;
    if (query.account !== 'all' && t.account_id !== query.account) return false;
    if (query.outcome === 'win' && !(t.net_pnl > 0)) return false;
    if (query.outcome === 'loss' && !(t.net_pnl < 0)) return false;
    if (query.outcome === 'be' && t.net_pnl !== 0) return false;
    if (query.side !== 'all' && t.direction !== query.side) return false;
    if (query.plan === 'yes' && t.plan_respected !== true) return false;
    if (query.plan === 'no' && t.plan_respected !== false) return false;
    if (query.state === 'open' && !isOpen(t)) return false;
    if (query.state === 'closed' && isOpen(t)) return false;
    if (q && !`${t.instrument} ${t.setup ?? ''} ${t.tags.join(' ')}`.toLowerCase().includes(q)) return false;
    if (query.from || query.to) {
      const day = dayKey(tradeTime(t), tz);
      if (query.from && day < query.from) return false;
      if (query.to && day > query.to) return false;
    }
    return true;
  });
}

/** R multiple : seulement si un risque positif est renseigné (même règle que les statistiques). */
export function rMultiple(t: Pick<Trade, 'net_pnl' | 'risk_amount'>): number | null {
  return t.risk_amount !== null && t.risk_amount > 0 ? t.net_pnl / t.risk_amount : null;
}

/** Tri par colonne ; les valeurs absentes restent en fin de liste, quelle que soit la direction. */
export function sortTrades(trades: readonly Trade[], sort: SortKey, dir: SortDir): Trade[] {
  const sign = dir === 'asc' ? 1 : -1;
  const time = (t: Trade): number => new Date(tradeTime(t)).getTime();
  const value = (t: Trade): number | string | null => {
    switch (sort) {
      case 'opened':
        return time(t);
      case 'instrument':
        return t.instrument;
      case 'size':
        return t.size;
      case 'pnl':
        return t.net_pnl;
      case 'r':
        return rMultiple(t);
      case 'setup':
        return t.setup;
    }
  };
  return [...trades].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) {
      if (va === vb) return time(b) - time(a);
      return va === null ? 1 : -1;
    }
    const cmp = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb, 'fr') : Number(va) - Number(vb);
    return cmp === 0 ? time(b) - time(a) : sign * cmp;
  });
}

/** Découpe une liste en pages ; la page demandée est ramenée dans les bornes. */
export function paginate(total: number, page: number, size: number = PAGE_SIZE): { page: number; pageCount: number; start: number; end: number } {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;
  return { page: current, pageCount, start, end: Math.min(start + size, total) };
}

export const OPTIONAL_COLUMNS = ['account', 'side', 'size', 'r', 'setup', 'plan'] as const;
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
export const COLUMN_LABELS: Record<OptionalColumn, string> = {
  account: 'Compte',
  side: 'Sens',
  size: 'Taille',
  r: 'R',
  setup: 'Setup',
  plan: 'Plan',
};

/** Colonnes optionnelles visibles ; sans préférence enregistrée, toutes sont affichées. */
export function parseColumns(raw: string | null): OptionalColumn[] {
  if (raw === null) return [...OPTIONAL_COLUMNS];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [...OPTIONAL_COLUMNS];
    return OPTIONAL_COLUMNS.filter((column) => (value as unknown[]).includes(column));
  } catch {
    return [...OPTIONAL_COLUMNS];
  }
}

export interface SavedView {
  id: string;
  name: string;
  /** Paramètres d’URL de la vue (filtres et tri), sans page ni trade ouvert. */
  query: string;
}

function isSavedView(value: unknown): value is SavedView {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.name === 'string' && typeof record.query === 'string';
}

export function parseViews(raw: string | null): SavedView[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return (value as unknown[]).filter(isSavedView);
  } catch {
    return [];
  }
}

/** Ajoute une vue (un nom identique remplace l’ancienne) ; nom vide : liste inchangée. */
export function addView(views: SavedView[], name: string, query: string): SavedView[] {
  const clean = name.trim().slice(0, 40);
  if (!clean) return views;
  return [...views.filter((view) => view.name !== clean), { id: newId(), name: clean, query }].slice(-MAX_VIEWS);
}

export function removeView(views: SavedView[], id: string): SavedView[] {
  return views.filter((view) => view.id !== id);
}
