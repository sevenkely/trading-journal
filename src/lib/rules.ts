import type { Account, Trade } from './types';
import { dayKey } from './format';
import { isOpen, sortByTradeTime, tradeTime } from './metrics';
import { round2 } from './utils';

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
  /** Équité réalisée (solde initial + P&L clôturé) */
  equity: number;
  /** Équité si toutes les positions ouvertes étaient clôturées maintenant */
  equityWithFloating: number;
  /** P&L net flottant des positions encore ouvertes (0 s'il n'y en a aucune) */
  floatingPnl: number;
  openCount: number;
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
 *
 * Les mesures de performance (P&L du jour, équité, jours de trading, cohérence) ne portent que sur
 * le **réalisé**. En revanche, les limites de **risque** (perte journalière et drawdown) intègrent
 * le **P&L flottant** des positions encore ouvertes : c'est la lecture prudente, celle qui protège
 * le compte si la position se clôture au prix actuel. Toute exposition ouverte est comptée dans la
 * journée en cours, même si la position a été ouverte la veille.
 */
export function evaluateAccount(account: Account, trades: Trade[], now: Date = new Date()): RuleReport {
  const initial = account.initial_balance;
  const tz = account.day_timezone || 'UTC';
  const realized = sortByTradeTime(trades.filter((t) => !isOpen(t)));
  const openPositions = trades.filter(isOpen);
  const today = dayKey(now, tz);

  let netPnl = 0;
  let todayPnl = 0;
  let cumulative = initial;
  let peak = initial;
  const perDay = new Map<string, number>();

  for (const t of realized) {
    netPnl += t.net_pnl;
    cumulative += t.net_pnl;
    peak = Math.max(peak, cumulative);
    const day = dayKey(tradeTime(t), tz);
    perDay.set(day, (perDay.get(day) ?? 0) + t.net_pnl);
    if (day === today) todayPnl += t.net_pnl;
  }

  const floatingPnl = round2(openPositions.reduce((sum, t) => sum + t.net_pnl, 0));
  const equity = initial + netPnl;
  const equityWithFloating = round2(equity + floatingPnl);
  const tradingDays = perDay.size;
  const dailyLimit = resolveAmount(account.daily_loss_amount, account.daily_loss_pct, initial);
  const maxLimit = resolveAmount(account.max_loss_amount, account.max_loss_pct, initial);
  const targetAmount = resolveAmount(account.profit_target_amount, account.profit_target_pct, initial);

  const gauges: Gauge[] = [];
  const alerts: string[] = [];
  let floor: number | null = null;

  if (dailyLimit !== null) {
    // Perte du jour réalisée + exposition ouverte : la limite journalière se lit au pire du moment
    const used = Math.max(0, -(todayPnl + floatingPnl));
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
    const remaining = equityWithFloating - floor;
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

  if (openPositions.length > 0) {
    const plural = openPositions.length > 1 ? 's' : '';
    alerts.push(
      `${openPositions.length} position${plural} ouverte${plural} : P&L flottant ${floatingPnl >= 0 ? '+' : ''}${floatingPnl.toFixed(2)} inclus dans les limites de risque`,
    );
  }

  return {
    equity,
    equityWithFloating,
    floatingPnl,
    openCount: openPositions.length,
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
