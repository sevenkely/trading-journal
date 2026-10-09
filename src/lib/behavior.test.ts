import { describe, expect, it } from 'vitest';
import { makeTrade } from '../test/fixtures';
import { detectBehavior, overtradingTrades, revengeTrades } from './behavior';

const trade = (id: string, opened: string, closed: string, net: number) =>
  makeTrade({ id, opened_at: opened, closed_at: closed, gross_pnl: net, fees: 0, net_pnl: net });

describe('revengeTrades', () => {
  it('signale un trade ouvert quelques minutes après la clôture d’une perte', () => {
    const loss = trade('perte', '2026-10-05T08:00:00.000Z', '2026-10-05T08:30:00.000Z', -100);
    const next = trade('suite', '2026-10-05T08:40:00.000Z', '2026-10-05T09:00:00.000Z', 50);
    expect(revengeTrades([loss, next]).map((t) => t.id)).toEqual(['suite']);
  });

  it('ignore un trade ouvert plus de 15 minutes après la perte', () => {
    const loss = trade('perte', '2026-10-05T08:00:00.000Z', '2026-10-05T08:30:00.000Z', -100);
    const later = trade('plus-tard', '2026-10-05T08:50:00.000Z', '2026-10-05T09:10:00.000Z', 20);
    expect(revengeTrades([loss, later])).toEqual([]);
  });

  it('ignore un trade ouvert juste après un gain', () => {
    const win = trade('gain', '2026-10-05T08:00:00.000Z', '2026-10-05T08:30:00.000Z', 100);
    const next = trade('suite', '2026-10-05T08:35:00.000Z', '2026-10-05T09:00:00.000Z', -20);
    expect(revengeTrades([win, next])).toEqual([]);
  });

  it('tient compte de la dernière clôture connue, même sur un autre compte', () => {
    const loss = makeTrade({ id: 'perte', account_id: 'compte-A', net_pnl: -80, gross_pnl: -80, opened_at: '2026-10-05T08:00:00.000Z', closed_at: '2026-10-05T08:20:00.000Z' });
    const other = makeTrade({ id: 'autre', account_id: 'compte-B', net_pnl: 30, gross_pnl: 30, opened_at: '2026-10-05T08:25:00.000Z', closed_at: '2026-10-05T08:45:00.000Z' });
    expect(revengeTrades([loss, other]).map((t) => t.id)).toEqual(['autre']);
  });
});

describe('overtradingTrades', () => {
  it('signale les trades au-delà du maximum quotidien, dans l’ordre de la journée', () => {
    const trades = [1, 2, 3, 4, 5].map((h) =>
      trade(`t${h}`, `2026-10-05T0${h}:00:00.000Z`, `2026-10-05T0${h}:30:00.000Z`, 10),
    );
    const result = overtradingTrades(trades, 'UTC', 3);
    expect(result.days).toBe(1);
    expect(result.trades.map((t) => t.id)).toEqual(['t4', 't5']);
  });

  it('ne signale rien quand la journée reste sous le plafond', () => {
    const trades = [1, 2].map((h) => trade(`t${h}`, `2026-10-05T0${h}:00:00.000Z`, `2026-10-05T0${h}:30:00.000Z`, 10));
    expect(overtradingTrades(trades, 'UTC', 4)).toEqual({ trades: [], days: 0 });
  });

  it('découpe les journées selon le fuseau du compte', () => {
    // Quatre trades : deux le 5 octobre en UTC, deux le 6 octobre en UTC.
    // À Tananarive (UTC+3), les quatre tombent le mardi 6 octobre.
    const trades = [
      trade('a', '2026-10-05T22:30:00.000Z', '2026-10-05T22:40:00.000Z', 10),
      trade('b', '2026-10-05T23:30:00.000Z', '2026-10-05T23:40:00.000Z', 10),
      trade('c', '2026-10-06T08:00:00.000Z', '2026-10-06T08:10:00.000Z', 10),
      trade('d', '2026-10-06T09:00:00.000Z', '2026-10-06T09:10:00.000Z', 10),
    ];
    // Tananarive : une seule journée de 4 trades, plafond 3 → seul le dernier est signalé
    expect(overtradingTrades(trades, 'Indian/Antananarivo', 3)).toEqual({ trades: [trades[3]], days: 1 });
    // UTC : deux journées de 2 trades, plafond 3 → rien
    expect(overtradingTrades(trades, 'UTC', 3)).toEqual({ trades: [], days: 0 });
    // UTC, plafond 1 : le second trade de chaque journée est signalé
    const strict = overtradingTrades(trades, 'UTC', 1);
    expect(strict.days).toBe(2);
    expect(strict.trades.map((t) => t.id)).toEqual(['b', 'd']);
  });
});

describe('detectBehavior', () => {
  it('réunit les deux signaux', () => {
    const loss = trade('perte', '2026-10-05T08:00:00.000Z', '2026-10-05T08:30:00.000Z', -100);
    const next = trade('suite', '2026-10-05T08:35:00.000Z', '2026-10-05T08:50:00.000Z', -30);
    const result = detectBehavior([loss, next], () => 'UTC');
    expect(result.revenge.map((t) => t.id)).toEqual(['suite']);
    expect(result.overtrading).toEqual([]);
    expect(result.overtradingDays).toBe(0);
  });

  it('compte le surtrading par compte : cinq trades sur un compte, deux sur l’autre', () => {
    const onA = [1, 2, 3, 4, 5].map((h) =>
      makeTrade({ id: `a${h}`, account_id: 'A', net_pnl: 10, opened_at: `2026-10-05T0${h}:00:00.000Z`, closed_at: `2026-10-05T0${h}:20:00.000Z` }),
    );
    const onB = [1, 2].map((h) =>
      makeTrade({ id: `b${h}`, account_id: 'B', net_pnl: 10, opened_at: `2026-10-05T1${h}:00:00.000Z`, closed_at: `2026-10-05T1${h}:20:00.000Z` }),
    );
    const result = detectBehavior([...onA, ...onB], () => 'UTC');
    expect(result.overtrading.map((t) => t.id)).toEqual(['a5']);
    expect(result.overtradingDays).toBe(1);
  });
});
