import type { Account, Trade } from './types';
import { dayKey } from './format';
import { resolveAmount } from './rules';
import { round2 } from './utils';

/** Fenêtre récente utilisée pour estimer le rythme actuel. */
export const FORECAST_LOOKBACK_DAYS = 30;

export interface Forecast {
  status: 'no-target' | 'reached' | 'no-data' | 'negative' | 'estimate';
  /** Montant restant avant l’objectif (négatif si atteint). */
  remaining: number | null;
  /** P&L net moyen par journée de trading, sur la fenêtre récente. */
  avgDailyPnl: number | null;
  /** Nombre de journées de trading nécessaires au rythme actuel. */
  tradingDays: number | null;
  /** Date estimée (YYYY-MM-DD), en supposant un trading du lundi au vendredi. */
  date: string | null;
  lookbackDays: number;
}

const DAY_MS = 86_400_000;

/** Ajoute un nombre de jours ouvrés (lundi à vendredi) à une date YYYY-MM-DD. */
export function addBusinessDays(from: string, count: number): string {
  const d = new Date(`${from}T12:00:00Z`);
  let added = 0;
  while (added < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    const weekday = d.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return d.toISOString().slice(0, 10);
}

/** Estime quand l’objectif de profit sera atteint, au rythme des derniers jours. */
export function forecastTarget(account: Account, trades: Trade[], now: Date, tz: string): Forecast {
  const base = { remaining: null, avgDailyPnl: null, tradingDays: null, date: null, lookbackDays: FORECAST_LOOKBACK_DAYS };
  const target = resolveAmount(account.profit_target_amount, account.profit_target_pct, account.initial_balance);
  if (target === null) return { ...base, status: 'no-target' };

  const netSoFar = trades.reduce((sum, t) => sum + t.net_pnl, 0);
  const remaining = round2(target - netSoFar);
  if (remaining <= 0) return { ...base, status: 'reached', remaining };

  const since = now.getTime() - FORECAST_LOOKBACK_DAYS * DAY_MS;
  const recent = trades.filter((t) => new Date(t.closed_at ?? t.opened_at).getTime() >= since);
  if (recent.length === 0) return { ...base, status: 'no-data', remaining };

  const activeDays = new Set(recent.map((t) => dayKey(t.closed_at ?? t.opened_at, tz))).size;
  const avgDailyPnl = round2(recent.reduce((sum, t) => sum + t.net_pnl, 0) / activeDays);
  if (avgDailyPnl <= 0) return { ...base, status: 'negative', remaining, avgDailyPnl };

  const tradingDays = Math.ceil(remaining / avgDailyPnl);
  return {
    ...base,
    status: 'estimate',
    remaining,
    avgDailyPnl,
    tradingDays,
    date: addBusinessDays(dayKey(now, tz), tradingDays),
  };
}
