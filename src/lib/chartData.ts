import type { Trade } from './types';
import { dailyMap, equitySeries, type DayCell } from './metrics';
import { shiftDays, weekdayHourGrid, type HeatCell } from './patterns';
import { round2 } from './utils';

/** Fuseau de la carte jour × heure : les sessions de marché se lisent en heure de New York. */
export const HOUR_REFERENCE_TZ = 'America/New_York';

/** Sous ce nombre de trades, une case de la carte jour × heure n’est pas une tendance : elle est grisée. */
export const MIN_HEAT_SAMPLE = 10;

const DAY_MS = 86_400_000;

export type Period = '7j' | '30j' | '90j' | 'all';

export const PERIODS: { value: Period; label: string; days: number | null }[] = [
  { value: '7j', label: '7 J', days: 7 },
  { value: '30j', label: '30 J', days: 30 },
  { value: '90j', label: '90 J', days: 90 },
  { value: 'all', label: 'Tout', days: null },
];

/** Règles de drawdown utilisées pour tracer le seuil (montants en devise, déjà résolus). */
export interface DrawdownRule {
  /** Perte maximale tolérée depuis le pic (trailing) ou depuis le solde initial (statique). */
  maxLoss: number | null;
  /** Objectif de profit, en plus du solde initial. */
  target: number | null;
  trailing: boolean;
}

export interface CurvePoint {
  /** 0 = solde initial, puis un point par trade (ordre chronologique) */
  n: number;
  /** Date de référence du trade (ISO) ; vide pour le solde initial */
  time: string;
  equity: number;
  /** P&L net du trade ; 0 pour le solde initial */
  pnl: number;
  /** Plus haut d’équité atteint jusqu’ici (solde initial inclus) */
  peak: number;
  /** Équité − pic, toujours ≤ 0 */
  drawdown: number;
  /** Drawdown en % du pic, toujours ≤ 0 */
  drawdownPct: number;
  /** Niveau de la limite de drawdown à ce point, ou null sans règle */
  limit: number | null;
}

/** Courbe d’équité avec pic, drawdown réalisé et seuil de drawdown, calculés depuis le départ du compte. */
export function buildCurve(trades: Trade[], startingBalance: number, rule?: DrawdownRule): CurvePoint[] {
  let peak = startingBalance;
  return equitySeries(trades, startingBalance).map((p) => {
    peak = Math.max(peak, p.equity);
    const drawdown = round2(p.equity - peak);
    const base = rule?.trailing ? peak : startingBalance;
    return {
      n: p.n,
      time: p.time,
      equity: round2(p.equity),
      pnl: round2(p.pnl),
      peak: round2(peak),
      drawdown,
      drawdownPct: peak > 0 ? round2((drawdown / peak) * 100) : 0,
      limit: rule?.maxLoss ? round2(base - rule.maxLoss) : null,
    };
  });
}

/** Niveau d’équité de l’objectif de profit, ou null sans objectif. */
export function targetLevel(startingBalance: number, rule?: DrawdownRule): number | null {
  return rule?.target ? round2(startingBalance + rule.target) : null;
}

/**
 * Premier index d’une période. Les périodes se comptent depuis le dernier trade (pas depuis aujourd’hui),
 * pour que la courbe ne soit jamais vide. Le point juste avant la fenêtre est gardé comme ancrage.
 */
export function periodStart(curve: CurvePoint[], period: Period): number {
  const days = PERIODS.find((p) => p.value === period)?.days ?? null;
  if (days === null || curve.length === 0) return 0;
  const last = [...curve].reverse().find((p) => p.time !== '');
  if (!last) return 0;
  const cutoff = Date.parse(last.time) - days * DAY_MS;
  const first = curve.findIndex((p) => p.time !== '' && Date.parse(p.time) >= cutoff);
  return first <= 0 ? 0 : first - 1;
}

export function sliceCurve(curve: CurvePoint[], period: Period): CurvePoint[] {
  return curve.slice(periodStart(curve, period));
}

export interface Extreme {
  index: number;
  equity: number;
}

/** Plus haut et plus bas d’équité d’une série, pour les marqueurs du graphique. */
export function equityExtremes(points: CurvePoint[]): { high: Extreme; low: Extreme } | null {
  if (points.length === 0) return null;
  let hi = 0;
  let lo = 0;
  points.forEach((p, i) => {
    if (p.equity > points[hi].equity) hi = i;
    if (p.equity < points[lo].equity) lo = i;
  });
  return {
    high: { index: hi, equity: points[hi].equity },
    low: { index: lo, equity: points[lo].equity },
  };
}

/** Pire drawdown (en %) d’une série de points. */
export function worstDrawdownPct(points: CurvePoint[]): number {
  return points.reduce((worst, p) => Math.min(worst, p.drawdownPct), 0);
}

export interface DayBar {
  /** YYYY-MM-DD dans le fuseau du compte */
  date: string;
  /** JJ/MM, sans fuseau */
  label: string;
  pnl: number;
  count: number;
}

export function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** P&L net par jour de trading, trié par date. */
export function dailyBars(trades: Trade[], tz: string): DayBar[] {
  return [...dailyMap(trades, tz).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, cell]) => ({ date, label: shortDate(date), pnl: round2(cell.pnl), count: cell.count }));
}

/** Garde les jours des N derniers jours de trading (le dernier jour compte pour le premier). */
export function daysInPeriod(bars: DayBar[], period: Period): DayBar[] {
  const days = PERIODS.find((p) => p.value === period)?.days ?? null;
  if (days === null || bars.length === 0) return bars;
  const last = bars[bars.length - 1].date;
  const cutoff = shiftDays(last, -(days - 1));
  return bars.filter((b) => b.date >= cutoff);
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface CalendarCell {
  /** YYYY-MM-DD */
  date: string;
  day: number;
  pnl: number;
  count: number;
}

/** Mois au format YYYY-MM décalé de `delta` mois. */
export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Grille d’un mois, semaines de lundi à dimanche ; null = case vide hors du mois. */
export function monthGrid(monthKey: string, daily: Map<string, DayCell>): (CalendarCell | null)[][] {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (CalendarCell | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${monthKey}-${String(day).padStart(2, '0')}`;
    const cell = daily.get(date);
    cells.push({ date, day, pnl: round2(cell?.pnl ?? 0), count: cell?.count ?? 0 });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** R réalisé de chaque trade (P&L net ÷ risque saisi). Les trades sans risque renseigné sont exclus. */
export function rMultiples(trades: Trade[]): number[] {
  return trades.flatMap((t) => (t.risk_amount && t.risk_amount > 0 ? [round2(t.net_pnl / t.risk_amount)] : []));
}

export interface RBin {
  from: number;
  to: number;
  count: number;
}

export interface RDistribution {
  bins: RBin[];
  count: number;
  mean: number;
  median: number;
  start: number;
  end: number;
}

/** Histogramme des R par intervalles réguliers (0,5 R par défaut), avec moyenne et médiane. */
export function rDistribution(values: number[], step = 0.5): RDistribution | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const start = Math.floor(min / step) * step;
  const end = Math.max(start + step, Math.ceil(max / step) * step);
  const total = Math.max(1, Math.round((end - start) / step));
  const bins: RBin[] = Array.from({ length: total }, (_, i) => {
    const from = round2(start + i * step);
    return { from, to: round2(from + step), count: 0 };
  });
  for (const v of values) {
    const index = Math.min(total - 1, Math.max(0, Math.floor((v - start) / step + 1e-9)));
    bins[index].count += 1;
  }
  return {
    bins,
    count: values.length,
    mean: round2(mean(values) ?? 0),
    median: round2(median(values) ?? 0),
    start: round2(start),
    end: round2(start + total * step),
  };
}

export interface OutcomeSplit {
  wins: number;
  losses: number;
  breakeven: number;
  total: number;
}

/** Répartition gagnants / perdants / break-even, selon le signe du P&L net. */
export function outcomeSplit(trades: Trade[]): OutcomeSplit {
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  for (const t of trades) {
    if (t.net_pnl > 0) wins += 1;
    else if (t.net_pnl < 0) losses += 1;
    else breakeven += 1;
  }
  return { wins, losses, breakeven, total: trades.length };
}

/** Carte jour × heure (heure de New York) : une case est grisée sous MIN_HEAT_SAMPLE trades. */
export function hourGrid(trades: Trade[]): Map<string, HeatCell> {
  return weekdayHourGrid(trades, HOUR_REFERENCE_TZ);
}

export function isThinCell(cell: HeatCell | undefined): boolean {
  return (cell?.count ?? 0) < MIN_HEAT_SAMPLE;
}
