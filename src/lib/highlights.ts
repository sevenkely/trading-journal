import type { BreakdownRow } from './metrics';

/**
 * Meilleure et pire ligne d’une répartition, selon le P&L net.
 * Pas de « pire » quand il n’y a qu’une ligne, ou quand toutes les lignes sont égales.
 */
export function extremes(rows: BreakdownRow[]): { best: BreakdownRow | null; worst: BreakdownRow | null } {
  if (rows.length === 0) return { best: null, worst: null };
  let best = rows[0];
  let worst = rows[0];
  for (const row of rows) {
    if (row.netPnl > best.netPnl) best = row;
    if (row.netPnl < worst.netPnl) worst = row;
  }
  return best === worst ? { best, worst: null } : { best, worst };
}
