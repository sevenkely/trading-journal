import type { Trade } from './types';
import { dayKey } from './format';

/** Date de référence d'un trade : clôture si connue, sinon ouverture. */
export const tradeTime = (t: Trade): string => t.closed_at ?? t.opened_at;

const toMs = (iso: string): number => new Date(iso).getTime();

export function sortByTradeTime(trades: Trade[]): Trade[] {
  return [...trades].sort(
    (a, b) => toMs(tradeTime(a)) - toMs(tradeTime(b)) || toMs(a.opened_at) - toMs(b.opened_at),
  );
}

/** Session de marché déduite de l'heure UTC d'ouverture (approximation, modifiable dans le formulaire). */
export function sessionForDate(iso: string): string {
  const h = new Date(iso).getUTCHours();
  if (h < 8) return 'Asie';
  if (h < 13) return 'Londres';
  if (h < 17) return 'Londres/New York';
  if (h < 21) return 'New York';
  return 'Hors session';
}

export function weekdayOf(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: tz }).format(new Date(iso));
}

export interface Stats {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** % de trades gagnants parmi les trades décidés (hors break-even) */
  winRate: number;
  netPnl: number;
  grossPnl: number;
  fees: number;
  avgWin: number;
  avgLoss: number;
  /** Gains bruts / pertes brutes. null = pas de pertes ni de gains ; Infinity = aucune perte. */
  profitFactor: number | null;
  /** Gain moyen par trade (P&L net / nombre de trades) */
  expectancy: number;
  avgR: number | null;
  bestTrade: number;
  worstTrade: number;
  /** Plus forte baisse de l'équité réalisée (montant positif) */
  maxDrawdown: number;
  maxWinStreak: number;
  maxLossStreak: number;
  tradingDays: number;
  bestDay: number;
  worstDay: number;
  planRespectedRate: number | null;
}

export function computeStats(trades: Trade[], tz = 'UTC'): Stats {
  const sorted = sortByTradeTime(trades);
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let netPnl = 0;
  let grossPnl = 0;
  let fees = 0;
  let rSum = 0;
  let rCount = 0;
  let best: number | null = null;
  let worst: number | null = null;
  let winStreak = 0;
  let lossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let planYes = 0;
  let planTotal = 0;
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const perDay = new Map<string, number>();

  for (const t of sorted) {
    const p = t.net_pnl;
    netPnl += p;
    grossPnl += t.gross_pnl;
    fees += t.fees;
    best = best === null ? p : Math.max(best, p);
    worst = worst === null ? p : Math.min(worst, p);

    if (p > 0) {
      wins += 1;
      grossWin += p;
      winStreak += 1;
      lossStreak = 0;
    } else if (p < 0) {
      losses += 1;
      grossLoss += p;
      lossStreak += 1;
      winStreak = 0;
    } else {
      breakeven += 1;
      winStreak = 0;
      lossStreak = 0;
    }
    maxWinStreak = Math.max(maxWinStreak, winStreak);
    maxLossStreak = Math.max(maxLossStreak, lossStreak);

    if (t.risk_amount && t.risk_amount > 0) {
      rSum += p / t.risk_amount;
      rCount += 1;
    }
    if (t.plan_respected !== null) {
      planTotal += 1;
      if (t.plan_respected) planYes += 1;
    }

    cumulative += p;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);

    const day = dayKey(tradeTime(t), tz);
    perDay.set(day, (perDay.get(day) ?? 0) + p);
  }

  const count = sorted.length;
  const decided = wins + losses;
  const dayValues = [...perDay.values()];

  let profitFactor: number | null = null;
  if (grossLoss < 0) profitFactor = grossWin / Math.abs(grossLoss);
  else if (grossWin > 0) profitFactor = Infinity;

  return {
    count,
    wins,
    losses,
    breakeven,
    winRate: decided > 0 ? (wins / decided) * 100 : 0,
    netPnl,
    grossPnl,
    fees,
    avgWin: wins > 0 ? grossWin / wins : 0,
    avgLoss: losses > 0 ? grossLoss / losses : 0,
    profitFactor,
    expectancy: count > 0 ? netPnl / count : 0,
    avgR: rCount > 0 ? rSum / rCount : null,
    bestTrade: best ?? 0,
    worstTrade: worst ?? 0,
    maxDrawdown,
    maxWinStreak,
    maxLossStreak,
    tradingDays: perDay.size,
    bestDay: dayValues.length > 0 ? Math.max(...dayValues) : 0,
    worstDay: dayValues.length > 0 ? Math.min(...dayValues) : 0,
    planRespectedRate: planTotal > 0 ? (planYes / planTotal) * 100 : null,
  };
}

export interface EquityPoint {
  /** Numéro du trade (0 = solde initial) */
  n: number;
  time: string;
  equity: number;
  pnl: number;
}

export function equitySeries(trades: Trade[], startingBalance: number): EquityPoint[] {
  let equity = startingBalance;
  const points: EquityPoint[] = [{ n: 0, time: '', equity: startingBalance, pnl: 0 }];
  sortByTradeTime(trades).forEach((t, i) => {
    equity += t.net_pnl;
    points.push({ n: i + 1, time: tradeTime(t), equity, pnl: t.net_pnl });
  });
  return points;
}

export interface DayCell {
  pnl: number;
  count: number;
}

export function dailyMap(trades: Trade[], tz: string): Map<string, DayCell> {
  const map = new Map<string, DayCell>();
  for (const t of trades) {
    const key = dayKey(tradeTime(t), tz);
    const cell = map.get(key) ?? { pnl: 0, count: 0 };
    cell.pnl += t.net_pnl;
    cell.count += 1;
    map.set(key, cell);
  }
  return map;
}

export interface BreakdownRow {
  key: string;
  count: number;
  netPnl: number;
  winRate: number;
  avgPnl: number;
}

/**
 * Regroupe les trades par clé (une clé unique ou plusieurs, ex. émotions).
 * emptyLabel = null : les trades sans valeur sont ignorés.
 */
export function breakdown(
  trades: Trade[],
  keysOf: (t: Trade) => string | string[] | null | undefined,
  emptyLabel: string | null = 'Non renseigné',
): BreakdownRow[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const raw = keysOf(t);
    const keys = (Array.isArray(raw) ? raw : [raw])
      .map((k) => (k ?? '').trim())
      .filter((k) => k.length > 0);
    const finalKeys = keys.length > 0 ? keys : emptyLabel !== null ? [emptyLabel] : [];
    for (const key of new Set(finalKeys)) {
      const list = groups.get(key);
      if (list) list.push(t);
      else groups.set(key, [t]);
    }
  }

  return [...groups.entries()]
    .map(([key, list]) => {
      const netPnl = list.reduce((sum, t) => sum + t.net_pnl, 0);
      const wins = list.filter((t) => t.net_pnl > 0).length;
      const losses = list.filter((t) => t.net_pnl < 0).length;
      return {
        key,
        count: list.length,
        netPnl,
        winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
        avgPnl: netPnl / list.length,
      };
    })
    .sort((a, b) => b.netPnl - a.netPnl);
}
