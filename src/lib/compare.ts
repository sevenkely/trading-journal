import type { Stats } from './metrics';

/**
 * Comparaison de deux périmètres (deux périodes, deux comptes) : chaque indicateur est présenté
 * avec sa valeur de part et d’autre et un écart signé. Le sens du progrès est déclaré par
 * indicateur — un drawdown qui monte n’est pas une bonne nouvelle, un P&L qui monte si.
 */

export type MetricFormat = 'money' | 'percent' | 'factor' | 'r' | 'count';

export interface CompareRow {
  key: string;
  label: string;
  /** Comment lire et écrire la valeur (la devise est celle du périmètre comparé). */
  format: MetricFormat;
  /** true = une valeur plus haute est un progrès ; false = plus basse ; null = ni l’un ni l’autre. */
  higherIsBetter: boolean | null;
  a: number | null;
  b: number | null;
  /** Écart B − A ; null si l’un des deux côtés n’a pas de valeur comparable. */
  delta: number | null;
}

/** Un périmètre : son nom (« Juillet · FTMO », « 30 jours · tous comptes ») et ses statistiques. */
export interface CompareSide {
  label: string;
  stats: Stats;
}

/** Un écart n’a de sens qu’entre deux nombres finis : ∞ (profit factor sans perte) se compare mal. */
function gap(a: number | null, b: number | null): number | null {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return b - a;
}

export function compareStats(a: Stats, b: Stats): CompareRow[] {
  const rows: Omit<CompareRow, 'a' | 'b' | 'delta'>[] = [
    { key: 'netPnl', label: 'P&L net', format: 'money', higherIsBetter: true },
    { key: 'expectancy', label: 'Espérance / trade', format: 'money', higherIsBetter: true },
    { key: 'count', label: 'Trades', format: 'count', higherIsBetter: null },
    { key: 'winRate', label: 'Taux de réussite', format: 'percent', higherIsBetter: true },
    { key: 'profitFactor', label: 'Profit factor', format: 'factor', higherIsBetter: true },
    { key: 'avgR', label: 'R moyen', format: 'r', higherIsBetter: true },
    { key: 'avgWin', label: 'Gain moyen', format: 'money', higherIsBetter: true },
    { key: 'avgLoss', label: 'Perte moyenne', format: 'money', higherIsBetter: true },
    { key: 'maxDrawdown', label: 'Drawdown réalisé', format: 'money', higherIsBetter: false },
    { key: 'planRespectedRate', label: 'Respect du plan', format: 'percent', higherIsBetter: true },
    { key: 'tradingDays', label: 'Jours tradés', format: 'count', higherIsBetter: null },
    { key: 'maxLossStreak', label: 'Plus longue série de pertes', format: 'count', higherIsBetter: false },
  ];

  return rows.map((row) => {
    const left = a[row.key as keyof Stats] as number | null;
    const right = b[row.key as keyof Stats] as number | null;
    return { ...row, a: left, b: right, delta: gap(left, right) };
  });
}

export interface CompareSummary {
  /** Indicateurs qui vont dans le sens du progrès (B meilleur que A). */
  improved: number;
  /** Indicateurs qui reculent. */
  regressed: number;
  /** Écart de P&L net, B − A. */
  pnlDelta: number;
}

export function summarizeCompare(rows: CompareRow[]): CompareSummary {
  let improved = 0;
  let regressed = 0;
  for (const row of rows) {
    if (row.higherIsBetter === null || row.delta === null || row.delta === 0) continue;
    const better = row.delta > 0 === row.higherIsBetter;
    if (better) improved += 1;
    else regressed += 1;
  }
  const pnl = rows.find((row) => row.key === 'netPnl');
  return { improved, regressed, pnlDelta: pnl?.delta ?? 0 };
}
