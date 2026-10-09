import type { Trade } from './types';
import { dayKey } from './format';

/** Un trade ouvert dans ce délai après la clôture d'une perte est signalé comme une revanche probable. */
export const REVENGE_WINDOW_MINUTES = 15;
/** Au-delà de ce nombre de trades dans une journée, les trades suivants sont signalés. */
export const MAX_TRADES_PER_DAY = 4;

export interface BehaviorSignals {
  /** Trades ouverts peu après la clôture d'une perte. */
  revenge: Trade[];
  /** Trades au-delà du maximum quotidien (les plus tardifs de la journée). */
  overtrading: Trade[];
  /** Nombre de journées ayant dépassé le maximum. */
  overtradingDays: number;
}

const openedAt = (t: Trade): number => new Date(t.opened_at).getTime();
const closedAt = (t: Trade): number => new Date(t.closed_at ?? t.opened_at).getTime();

/** Trades ouverts dans la fenêtre qui suit la clôture d'une perte (tous comptes confondus). */
export function revengeTrades(trades: Trade[], windowMinutes = REVENGE_WINDOW_MINUTES): Trade[] {
  const sorted = [...trades].sort((a, b) => openedAt(a) - openedAt(b));
  const flagged: Trade[] = [];
  for (const t of sorted) {
    const opened = openedAt(t);
    // Dernière position clôturée avant cette ouverture
    let previous: Trade | null = null;
    for (const p of sorted) {
      if (p.id === t.id || closedAt(p) > opened) continue;
      if (previous === null || closedAt(p) > closedAt(previous)) previous = p;
    }
    if (previous && previous.net_pnl < 0 && opened - closedAt(previous) <= windowMinutes * 60_000) {
      flagged.push(t);
    }
  }
  return flagged;
}

/** Trades au-delà du maximum quotidien, dans l'ordre chronologique de chaque journée. */
export function overtradingTrades(
  trades: Trade[],
  tz: string,
  maxPerDay = MAX_TRADES_PER_DAY,
): { trades: Trade[]; days: number } {
  const byDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const key = dayKey(t.opened_at, tz);
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }
  const flagged: Trade[] = [];
  let days = 0;
  for (const list of byDay.values()) {
    if (list.length <= maxPerDay) continue;
    days += 1;
    const ordered = [...list].sort((a, b) => openedAt(a) - openedAt(b));
    flagged.push(...ordered.slice(maxPerDay));
  }
  return { trades: flagged, days };
}

/**
 * Réunit les signaux. La revanche se lit sur toute la chronologie (tous comptes confondus) ;
 * le surtrading se compte par compte, dans le fuseau de chaque compte (sa journée de trading).
 */
export function detectBehavior(trades: Trade[], tzOf: (accountId: string) => string): BehaviorSignals {
  const byAccount = new Map<string, Trade[]>();
  for (const t of trades) {
    byAccount.set(t.account_id, [...(byAccount.get(t.account_id) ?? []), t]);
  }
  const overtrading: Trade[] = [];
  let overtradingDays = 0;
  for (const [accountId, list] of byAccount) {
    const over = overtradingTrades(list, tzOf(accountId));
    overtrading.push(...over.trades);
    overtradingDays += over.days;
  }
  return { revenge: revengeTrades(trades), overtrading, overtradingDays };
}
