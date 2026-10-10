import { describe, expect, it } from 'vitest';
import { compareStats, summarizeCompare } from './compare';
import type { Stats } from './metrics';

function stats(overrides: Partial<Stats> = {}): Stats {
  return {
    count: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    winRate: 0,
    netPnl: 0,
    grossPnl: 0,
    fees: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: null,
    expectancy: 0,
    avgR: null,
    bestTrade: 0,
    worstTrade: 0,
    maxDrawdown: 0,
    maxWinStreak: 0,
    maxLossStreak: 0,
    tradingDays: 0,
    bestDay: 0,
    worstDay: 0,
    planRespectedRate: null,
    ...overrides,
  };
}

describe('comparaison de deux périmètres', () => {
  it('calcule l’écart B − A et déclare le sens de lecture de chaque indicateur', () => {
    const rows = compareStats(stats({ netPnl: 1_000, maxDrawdown: 400 }), stats({ netPnl: 1_300, maxDrawdown: 250 }));

    const net = rows.find((r) => r.key === 'netPnl');
    expect(net?.delta).toBe(300);
    expect(net?.higherIsBetter).toBe(true);

    // Un drawdown plus faible est un progrès : l’écart négatif va dans le bon sens
    const drawdown = rows.find((r) => r.key === 'maxDrawdown');
    expect(drawdown?.delta).toBe(-150);
    expect(drawdown?.higherIsBetter).toBe(false);

    // Le nombre de trades n’est ni bon ni mauvais en soi
    expect(rows.find((r) => r.key === 'count')?.higherIsBetter).toBeNull();
  });

  it('n’affiche pas d’écart quand une valeur manque ou n’est pas finie', () => {
    const rows = compareStats(
      stats({ avgR: null, profitFactor: Infinity, planRespectedRate: null }),
      stats({ avgR: 1.2, profitFactor: 3, planRespectedRate: 80 }),
    );
    expect(rows.find((r) => r.key === 'avgR')?.delta).toBeNull();
    expect(rows.find((r) => r.key === 'profitFactor')?.delta).toBeNull();
    expect(rows.find((r) => r.key === 'planRespectedRate')?.delta).toBeNull();
    // Les valeurs elles-mêmes restent affichables des deux côtés
    expect(rows.find((r) => r.key === 'avgR')?.b).toBe(1.2);
  });

  it('compte les progrès et les reculs, et retient l’écart de P&L net', () => {
    const rows = compareStats(
      stats({ netPnl: 100, maxDrawdown: 500, winRate: 40, tradingDays: 10, maxLossStreak: 2 }),
      stats({ netPnl: 400, maxDrawdown: 200, winRate: 40, tradingDays: 12, maxLossStreak: 4 }),
    );
    const summary = summarizeCompare(rows);
    expect(summary.pnlDelta).toBe(300);
    // P&L net en hausse et drawdown en baisse : deux progrès ; la série de pertes s’allonge : un recul
    expect(summary.improved).toBe(2);
    expect(summary.regressed).toBe(1);
  });

  it('ne compte ni les écarts nuls ni les indicateurs sans jugement', () => {
    const summary = summarizeCompare(compareStats(stats({ netPnl: 50, count: 3 }), stats({ netPnl: 50, count: 9 })));
    expect(summary).toEqual({ improved: 0, regressed: 0, pnlDelta: 0 });
  });
});
