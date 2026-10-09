import { describe, expect, it } from 'vitest';
import { extremes } from './highlights';
import type { BreakdownRow } from './metrics';

const row = (key: string, netPnl: number): BreakdownRow => ({ key, count: 1, netPnl, winRate: 0, avgPnl: netPnl });

describe('extremes', () => {
  it('trouve la meilleure et la pire ligne', () => {
    const result = extremes([row('Asie', 100), row('Londres', -700), row('NY', 900)]);
    expect(result.best?.key).toBe('NY');
    expect(result.worst?.key).toBe('Londres');
  });

  it('ne renvoie pas de « pire » quand il n’y a qu’une ligne, ou que toutes sont égales', () => {
    expect(extremes([row('Asie', 100)])).toEqual({ best: row('Asie', 100), worst: null });
    expect(extremes([row('A', 5), row('B', 5)]).worst).toBeNull();
  });

  it('gère une liste vide', () => {
    expect(extremes([])).toEqual({ best: null, worst: null });
  });
});
