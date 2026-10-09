import { describe, expect, it } from 'vitest';
import {
  breakdown,
  computeStats,
  equitySeries,
  sessionForDate,
  sortByTradeTime,
  weekdayOf,
} from './metrics';
import { makeTrade } from '../test/fixtures';

const at = (hour: number) => `2026-10-05T${String(hour).padStart(2, '0')}:00:00.000Z`;

describe('computeStats', () => {
  it('calcule P&L, réussite, profit factor et espérance', () => {
    const trades = [
      makeTrade({ id: '1', gross_pnl: 100, closed_at: at(9) }),
      makeTrade({ id: '2', gross_pnl: -50, closed_at: at(10) }),
      makeTrade({ id: '3', gross_pnl: 50, closed_at: at(11) }),
      makeTrade({ id: '4', gross_pnl: 0, closed_at: at(12) }),
    ];
    const s = computeStats(trades, 'UTC');
    expect(s.count).toBe(4);
    expect(s.netPnl).toBe(100);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.breakeven).toBe(1);
    expect(s.winRate).toBeCloseTo(66.67, 1);
    expect(s.profitFactor).toBe(3);
    expect(s.expectancy).toBe(25);
    expect(s.avgWin).toBe(75);
    expect(s.avgLoss).toBe(-50); // négatif : moyenne des pertes
    expect(s.bestTrade).toBe(100);
    expect(s.worstTrade).toBe(-50);
  });

  it('gère le profit factor infini sans perte et nul sans trade', () => {
    expect(computeStats([makeTrade({ gross_pnl: 10 })]).profitFactor).toBe(Infinity);
    const empty = computeStats([]);
    expect(empty.profitFactor).toBeNull();
    expect(empty.count).toBe(0);
    expect(empty.winRate).toBe(0);
    expect(empty.avgR).toBeNull();
    expect(empty.planRespectedRate).toBeNull();
  });

  it('déduit les frais du P&L net', () => {
    const s = computeStats([makeTrade({ gross_pnl: 100, fees: 7.5, closed_at: at(9) })]);
    expect(s.grossPnl).toBe(100);
    expect(s.fees).toBe(7.5);
    expect(s.netPnl).toBe(92.5);
  });

  it('mesure le drawdown réalisé le plus fort', () => {
    const trades = [200, -300, 100, -50].map((p, i) => makeTrade({ id: `t${i}`, gross_pnl: p, closed_at: at(i + 1) }));
    // Équité : 200 → -100 (creux à -300 depuis le pic) → 0 → -50
    expect(computeStats(trades).maxDrawdown).toBe(300);
  });

  it('compte les séries gagnantes et perdantes', () => {
    const trades = [1, 1, -1, -1, -1, 1].map((p, i) => makeTrade({ id: `t${i}`, gross_pnl: p, closed_at: at(i + 1) }));
    const s = computeStats(trades);
    expect(s.maxWinStreak).toBe(2);
    expect(s.maxLossStreak).toBe(3);
  });

  it('calcule le R moyen et le taux de respect du plan', () => {
    const trades = [
      makeTrade({ id: 'a', gross_pnl: 200, risk_amount: 100, plan_respected: true, closed_at: at(9) }),
      makeTrade({ id: 'b', gross_pnl: -100, risk_amount: 100, plan_respected: true, closed_at: at(10) }),
      makeTrade({ id: 'c', gross_pnl: 50, risk_amount: null, plan_respected: false, closed_at: at(11) }),
    ];
    const s = computeStats(trades);
    expect(s.avgR).toBeCloseTo(0.5); // (+2R et -1R), le trade sans risque est exclu
    expect(s.planRespectedRate).toBeCloseTo(66.67, 1);
  });

  it('découpe les journées selon le fuseau du compte', () => {
    // 22:30 UTC le 8 = 01:30 le 9 à Antananarivo (UTC+3)
    const trades = [
      makeTrade({ id: 'a', gross_pnl: 10, closed_at: '2026-10-08T22:30:00.000Z' }),
      makeTrade({ id: 'b', gross_pnl: 20, closed_at: '2026-10-09T05:00:00.000Z' }),
    ];
    expect(computeStats(trades, 'UTC').tradingDays).toBe(2);
    const tana = computeStats(trades, 'Indian/Antananarivo');
    expect(tana.tradingDays).toBe(1);
    expect(tana.bestDay).toBe(30);
  });
});

describe('séries et regroupements', () => {
  it('trie par date de clôture', () => {
    const late = makeTrade({ id: 'late', closed_at: at(15) });
    const early = makeTrade({ id: 'early', closed_at: at(8) });
    expect(sortByTradeTime([late, early]).map((t) => t.id)).toEqual(['early', 'late']);
  });

  it('démarre la courbe au solde initial (n = 0)', () => {
    const points = equitySeries([makeTrade({ gross_pnl: 100, closed_at: at(9) }), makeTrade({ gross_pnl: -40, closed_at: at(10) })], 10000);
    expect(points.map((p) => p.equity)).toEqual([10000, 10100, 10060]);
    expect(points[0].n).toBe(0);
  });

  it('associe chaque heure UTC à une session', () => {
    expect(sessionForDate('2026-10-05T06:00:00.000Z')).toBe('Asie');
    expect(sessionForDate('2026-10-05T10:00:00.000Z')).toBe('Londres');
    expect(sessionForDate('2026-10-05T14:00:00.000Z')).toBe('Londres/New York');
    expect(sessionForDate('2026-10-05T18:00:00.000Z')).toBe('New York');
    expect(sessionForDate('2026-10-05T22:00:00.000Z')).toBe('Hors session');
  });

  it('nomme le jour de la semaine dans le fuseau demandé', () => {
    expect(weekdayOf('2026-10-05T12:00:00.000Z', 'UTC')).toBe('lundi');
  });

  it('regroupe par clé multiple et ignore les vides si demandé', () => {
    const trades = [
      makeTrade({ id: '1', gross_pnl: 100, emotions_before: ['Calme', 'Doute'], closed_at: at(9) }),
      makeTrade({ id: '2', gross_pnl: -40, emotions_before: ['Doute'], closed_at: at(10) }),
      makeTrade({ id: '3', gross_pnl: 20, emotions_before: [], closed_at: at(11) }),
    ];
    const rows = breakdown(trades, (t) => t.emotions_before, null);
    expect(rows.map((r) => r.key)).toEqual(['Calme', 'Doute']);
    const doute = rows.find((r) => r.key === 'Doute');
    expect(doute?.count).toBe(2);
    expect(doute?.netPnl).toBe(60);
    expect(doute?.winRate).toBe(50);

    const withEmpty = breakdown(trades, (t) => t.emotions_before);
    expect(withEmpty.map((r) => r.key)).toContain('Non renseigné');
  });
});
