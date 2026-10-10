import { describe, expect, it } from 'vitest';
import {
  buildCurve,
  daysInPeriod,
  dailyBars,
  equityExtremes,
  hourGrid,
  isThinCell,
  mean,
  median,
  outcomeSplit,
  periodStart,
  rDistribution,
  rMultiples,
  sliceCurve,
  targetLevel,
  worstDrawdownPct,
} from '../lib/chartData';
import type { Trade } from '../lib/types';

/** Trade minimal : seuls les champs lus par les calculs sont renseignés. */
function trade(id: number, closedAt: string, netPnl: number, risk: number | null = 100, openedAt?: string): Trade {
  return {
    id: `t${id}`,
    account_id: 'a1',
    instrument: 'EURUSD',
    direction: 'long',
    opened_at: openedAt ?? closedAt,
    closed_at: closedAt,
    entry_price: null,
    exit_price: null,
    stop_loss: null,
    take_profit: null,
    size: null,
    risk_amount: risk,
    gross_pnl: netPnl,
    fees: 0,
    net_pnl: netPnl,
    session: null,
    setup: null,
    timeframe: null,
    emotions_before: [],
    emotions_after: [],
    plan_respected: null,
    mistakes: [],
    checklist_done: [],
    notes: null,
    tags: [],
    source: 'manual',
    external_id: null,
    import_batch_id: null,
    screenshots: [],
    created_at: closedAt,
  } as Trade;
}

describe('courbe d’équité et drawdown', () => {
  const trades = [
    trade(1, '2026-03-02T15:00:00Z', 300),
    trade(2, '2026-03-03T15:00:00Z', -500),
    trade(3, '2026-03-04T15:00:00Z', -200),
    trade(4, '2026-03-05T15:00:00Z', 400),
  ];

  it('part du solde initial et suit l’équité trade après trade', () => {
    const curve = buildCurve(trades, 10_000);
    expect(curve.map((p) => p.equity)).toEqual([10_000, 10_300, 9_800, 9_600, 10_000]);
    expect(curve[0].n).toBe(0);
    expect(curve[0].time).toBe('');
  });

  it('calcule le pic, le drawdown en $ et en % (toujours ≤ 0)', () => {
    const curve = buildCurve(trades, 10_000);
    expect(curve[2].peak).toBe(10_300);
    expect(curve[2].drawdown).toBe(-500);
    expect(curve[2].drawdownPct).toBeCloseTo(-4.85, 2);
    expect(curve.every((p) => p.drawdownPct <= 0)).toBe(true);
    expect(worstDrawdownPct(curve)).toBeCloseTo(-6.8, 1);
  });

  it('trace la limite statique depuis le solde initial, puis la limite trailing depuis le pic', () => {
    const fixed = buildCurve(trades, 10_000, { maxLoss: 1_000, target: null, trailing: false });
    expect(fixed.every((p) => p.limit === 9_000)).toBe(true);

    const trailing = buildCurve(trades, 10_000, { maxLoss: 1_000, target: null, trailing: true });
    expect(trailing[2].limit).toBe(9_300); // pic 10 300 − 1 000
    expect(trailing[0].limit).toBe(9_000);
  });

  it('sans règle, la limite est absente et l’objectif aussi', () => {
    const curve = buildCurve(trades, 10_000);
    expect(curve.every((p) => p.limit === null)).toBe(true);
    expect(targetLevel(10_000)).toBeNull();
    expect(targetLevel(10_000, { maxLoss: null, target: 800, trailing: false })).toBe(10_800);
  });

  it('repère les extrêmes d’équité', () => {
    const curve = buildCurve(trades, 10_000);
    const extremes = equityExtremes(curve);
    expect(extremes?.high).toEqual({ index: 1, equity: 10_300 });
    expect(extremes?.low).toEqual({ index: 3, equity: 9_600 });
    expect(equityExtremes([])).toBeNull();
  });
});

describe('périodes 7 J, 30 J, 90 J, Tout', () => {
  const days = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i, 15));
    return trade(i + 1, d.toISOString(), 10);
  });
  const curve = buildCurve(days, 1_000);

  it('« Tout » garde toute la courbe', () => {
    expect(periodStart(curve, 'all')).toBe(0);
    expect(sliceCurve(curve, 'all')).toHaveLength(curve.length);
  });

  it('une période garde le point d’ancrage juste avant la fenêtre', () => {
    const slice = sliceCurve(curve, '7j');
    // Dernier trade le 1er mars (2026 n’est pas bissextile) ; fenêtre de 7 jours depuis le 22 février :
    // l’ancrage est le trade du 21 février, puis les trades du 22 février au 1er mars (9 points)
    expect(slice[0].time.slice(0, 10)).toBe('2026-02-21');
    expect(slice.length).toBe(9);
  });

  it('compte depuis le dernier trade, jamais depuis aujourd’hui', () => {
    expect(sliceCurve(curve, '30j').length).toBeGreaterThan(20);
    expect(sliceCurve(curve, '90j')).toHaveLength(curve.length);
  });

  it('filtre les jours de trading sur la même logique', () => {
    const bars = dailyBars(days, 'UTC');
    expect(daysInPeriod(bars, '7j')).toHaveLength(7);
    expect(daysInPeriod(bars, 'all')).toHaveLength(bars.length);
  });
});

describe('P&L par jour', () => {
  it('additionne les trades d’un même jour dans le fuseau du compte et trie par date', () => {
    const list = [
      trade(1, '2026-03-04T14:00:00Z', 50),
      trade(2, '2026-03-04T18:00:00Z', -20),
      trade(3, '2026-03-02T14:00:00Z', 10),
    ];
    const bars = dailyBars(list, 'UTC');
    expect(bars).toEqual([
      { date: '2026-03-02', label: '02/03', pnl: 10, count: 1 },
      { date: '2026-03-04', label: '04/03', pnl: 30, count: 2 },
    ]);
  });

  it('moyenne et médiane', () => {
    expect(mean([1, 2, 6])).toBeCloseTo(3);
    expect(mean([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('histogramme des R', () => {
  it('ignore les trades sans risque et calcule R = net ÷ risque', () => {
    const list = [trade(1, '2026-03-02T15:00:00Z', 200, 100), trade(2, '2026-03-03T15:00:00Z', -50, null)];
    expect(rMultiples(list)).toEqual([2]);
  });

  it('répartit les valeurs par intervalles de 0,5 R, avec moyenne et médiane', () => {
    const dist = rDistribution([-1, -0.2, 0.3, 0.7, 2]);
    expect(dist).not.toBeNull();
    expect(dist?.count).toBe(5);
    expect(dist?.bins.reduce((sum, b) => sum + b.count, 0)).toBe(5);
    expect(dist?.mean).toBeCloseTo(0.36, 2);
    expect(dist?.median).toBe(0.3);
    expect(dist?.start).toBe(-1);
    expect(dist?.end).toBe(2);
  });

  it('gère le cas d’un seul R et le cas vide', () => {
    expect(rDistribution([])).toBeNull();
    const one = rDistribution([1]);
    expect(one?.bins.length).toBeGreaterThanOrEqual(1);
    expect(one?.bins.reduce((sum, b) => sum + b.count, 0)).toBe(1);
  });
});

describe('répartition gagnants / perdants', () => {
  it('compte gagnants, perdants et break-even selon le signe du P&L net', () => {
    const list = [trade(1, '2026-03-02T15:00:00Z', 5), trade(2, '2026-03-03T15:00:00Z', -5), trade(3, '2026-03-04T15:00:00Z', 0)];
    expect(outcomeSplit(list)).toEqual({ wins: 1, losses: 1, breakeven: 1, total: 3 });
  });
});

describe('carte jour × heure en heure de New York', () => {
  it('convertit l’heure UTC en heure de New York (hiver : UTC−5, été : UTC−4)', () => {
    // 14:30 UTC en janvier = 09:30 à New York ; en juillet = 10:30
    const winter = hourGrid([trade(1, '2026-01-15T14:30:00Z', 10, 100, '2026-01-15T14:30:00Z')]);
    expect([...winter.keys()]).toEqual(['3-9']); // jeudi 9 h
    const summer = hourGrid([trade(2, '2026-07-15T14:30:00Z', 10, 100, '2026-07-15T14:30:00Z')]);
    expect([...summer.keys()]).toEqual(['2-10']); // mercredi 10 h
  });

  it('grise les cases de moins de 10 trades', () => {
    const list = Array.from({ length: 10 }, (_, i) => trade(i, '2026-01-15T14:30:00Z', 10, 100, '2026-01-15T14:30:00Z'));
    const grid = hourGrid([...list, trade(99, '2026-01-16T14:30:00Z', 5, 100, '2026-01-16T14:30:00Z')]);
    expect(isThinCell(grid.get('3-9'))).toBe(false);
    expect(isThinCell(grid.get('4-9'))).toBe(true);
    expect(isThinCell(undefined)).toBe(true);
  });
});

describe('niveaux de règles', () => {
  it('l’objectif s’ajoute au solde initial', () => {
    expect(targetLevel(5_000, { maxLoss: null, target: 400, trailing: false })).toBe(5_400);
  });
});
