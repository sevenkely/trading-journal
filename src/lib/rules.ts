import type { Account, Trade } from './types';
import { dayKey } from './format';
import { sortByTradeTime, tradeTime } from './metrics';

export type Level = 'ok' | 'warning' | 'danger' | 'breached';

export interface Gauge {
  key: 'daily' | 'maxLoss' | 'target' | 'days' | 'consistency';
  label: string;
  /** risk = limite à ne pas dépasser ; progress = objectif à atteindre */
  kind: 'risk' | 'progress';
  unit: 'money' | 'percent' | 'days';
  /** Valeur actuelle (perte utilisée, progression, jours, part du meilleur jour) */
  value: number;
  /** Limite ou objectif */
  limit: number;
  /** Marge restante avant la limite, ou reste à faire pour l'objectif */
  remaining: number | null;
  /** Remplissage de la barre (peut dépasser 1 si la règle est enfreinte) */
  ratio: number;
  level: Level;
}

export interface RuleReport {
  equity: number;
  netPnl: number;
  todayPnl: number;
  peak: number;
  /** Seuil de perte maximale (équité en dessous = compte échoué) */
  floor: number | null;
  tradingDays: number;
  hasRules: boolean;
  overall: Level;
  gauges: Gauge[];
  alerts: string[];
}

const RANK: Record<Level, number> = { ok: 0, warning: 1, danger: 2, breached: 3 };

export function levelFromRatio(ratio: number): Level {
  if (ratio >= 1) return 'breached';
  if (ratio >= 0.8) return 'danger';
  if (ratio >= 0.5) return 'warning';
  return 'ok';
}

/** Montant prioritaire sur le pourcentage. Retourne null si aucune règle n'est définie. */
export function resolveAmount(amount: number | null, pct: number | null, base: number): number | null {
  if (amount != null && amount > 0) return amount;
  if (pct != null && pct > 0) return (pct / 100) * base;
  return null;
}

export function hasAnyRule(account: Account): boolean {
  return (
    resolveAmount(account.daily_loss_amount, account.daily_loss_pct, account.initial_balance) !== null ||
    resolveAmount(account.max_loss_amount, account.max_loss_pct, account.initial_balance) !== null ||
    resolveAmount(account.profit_target_amount, account.profit_target_pct, account.initial_balance) !== null ||
    account.min_trading_days > 0 ||
    (account.consistency_pct !== null && account.consistency_pct > 0)
  );
}

/**
 * Évalue les règles d'un compte (perte journalière, drawdown, objectif, jours minimum, cohérence).
 * Basé sur le P&L réalisé : le P&L flottant des positions ouvertes n'est pas pris en compte.
 */
export function evaluateAccount(account: Account, trades: Trade[], now: Date = new Date()): RuleReport {
  const initial = account.initial_balance;
  const tz = account.day_timezone || 'UTC';
  const sorted = sortByTradeTime(trades);
  const today = dayKey(now, tz);

  let netPnl = 0;
  let todayPnl = 0;
  let cumulative = initial;
  let peak = initial;
  const perDay = new Map<string, number>();

  for (const t of sorted) {
    netPnl += t.net_pnl;
    cumulative += t.net_pnl;
    peak = Math.max(peak, cumulative);
    const day = dayKey(tradeTime(t), tz);
    perDay.set(day, (perDay.get(day) ?? 0) + t.net_pnl);
    if (day === today) todayPnl += t.net_pnl;
  }

  const equity = initial + netPnl;
  const tradingDays = perDay.size;
  const dailyLimit = resolveAmount(account.daily_loss_amount, account.daily_loss_pct, initial);
  const maxLimit = resolveAmount(account.max_loss_amount, account.max_loss_pct, initial);
  const targetAmount = resolveAmount(account.profit_target_amount, account.profit_target_pct, initial);

  const gauges: Gauge[] = [];
  const alerts: string[] = [];
  let floor: number | null = null;

  if (dailyLimit !== null) {
    const used = Math.max(0, -todayPnl);
    const ratio = used / dailyLimit;
    gauges.push({
      key: 'daily',
      label: 'Perte journalière',
      kind: 'risk',
      unit: 'money',
      value: used,
      limit: dailyLimit,
      remaining: dailyLimit - used,
      ratio,
      level: levelFromRatio(ratio),
    });
  }

  if (maxLimit !== null) {
    const trailing = account.drawdown_type === 'trailing';
    // Trailing : le seuil suit le plus haut de l'équité, mais s'arrête au solde initial.
    floor = trailing ? Math.min(peak - maxLimit, initial) : initial - maxLimit;
    const remaining = equity - floor;
    const used = Math.max(0, maxLimit - remaining);
    const ratio = used / maxLimit;
    gauges.push({
      key: 'maxLoss',
      label: trailing ? 'Drawdown max (trailing)' : 'Drawdown max',
      kind: 'risk',
      unit: 'money',
      value: used,
      limit: maxLimit,
      remaining,
      ratio,
      level: levelFromRatio(ratio),
    });
  }

  if (targetAmount !== null) {
    const progress = Math.max(0, netPnl);
    gauges.push({
      key: 'target',
      label: 'Objectif de profit',
      kind: 'progress',
      unit: 'money',
      value: progress,
      limit: targetAmount,
      remaining: Math.max(0, targetAmount - progress),
      ratio: progress / targetAmount,
      level: 'ok',
    });
  }

  if (account.min_trading_days > 0) {
    const min = account.min_trading_days;
    gauges.push({
      key: 'days',
      label: 'Jours de trading',
      kind: 'progress',
      unit: 'days',
      value: tradingDays,
      limit: min,
      remaining: Math.max(0, min - tradingDays),
      ratio: Math.min(1, tradingDays / min),
      level: 'ok',
    });
  }

  if (account.consistency_pct !== null && account.consistency_pct > 0 && netPnl > 0) {
    const bestDay = Math.max(...perDay.values());
    const share = (bestDay / netPnl) * 100;
    const ratio = share / account.consistency_pct;
    gauges.push({
      key: 'consistency',
      label: 'Meilleur jour (cohérence)',
      kind: 'risk',
      unit: 'percent',
      value: share,
      limit: account.consistency_pct,
      remaining: null,
      ratio,
      level: levelFromRatio(ratio),
    });
  }

  for (const g of gauges) {
    if (g.kind !== 'risk' || g.level === 'ok') {
      if (g.key === 'target' && g.ratio >= 1) alerts.push('Objectif de profit atteint');
      continue;
    }
    const pct = Math.round(g.ratio * 100);
    if (g.key === 'daily') {
      alerts.push(g.level === 'breached' ? 'Limite de perte journalière atteinte' : `Perte journalière utilisée à ${pct} %`);
    } else if (g.key === 'maxLoss') {
      alerts.push(g.level === 'breached' ? 'Drawdown maximum atteint' : `Drawdown utilisé à ${pct} %`);
    } else if (g.key === 'consistency') {
      alerts.push(
        g.level === 'breached'
          ? 'Règle de cohérence dépassée (meilleur jour trop important)'
          : `Cohérence proche de la limite (${pct} %)`,
      );
    }
  }

  const overall = gauges.reduce<Level>((acc, g) => (RANK[g.level] > RANK[acc] ? g.level : acc), 'ok');

  return {
    equity,
    netPnl,
    todayPnl,
    peak,
    floor,
    tradingDays,
    hasRules: gauges.length > 0,
    overall,
    gauges,
    alerts,
  };
}
