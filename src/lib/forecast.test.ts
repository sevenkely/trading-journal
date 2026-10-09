import { describe, expect, it } from 'vitest';
import { makeAccount, makeTrade } from '../test/fixtures';
import { addBusinessDays, forecastTarget } from './forecast';

const NOW = new Date('2026-10-09T12:00:00.000Z'); // vendredi

const closedOn = (id: string, day: string, net: number) =>
  makeTrade({
    id,
    net_pnl: net,
    gross_pnl: net,
    fees: 0,
    opened_at: `${day}T08:00:00.000Z`,
    closed_at: `${day}T09:00:00.000Z`,
  });

describe('addBusinessDays', () => {
  it('saute le week-end', () => {
    expect(addBusinessDays('2026-10-09', 1)).toBe('2026-10-12'); // vendredi → lundi
    expect(addBusinessDays('2026-10-09', 8)).toBe('2026-10-21');
  });
});

describe('forecastTarget', () => {
  it('signale l’absence d’objectif', () => {
    const result = forecastTarget(makeAccount({ initial_balance: 5000 }), [], NOW, 'UTC');
    expect(result.status).toBe('no-target');
    expect(result.date).toBeNull();
  });

  it('estime la date au rythme moyen des 30 derniers jours', () => {
    // Objectif 10 % de 10 000 = 1 000 ; déjà 200 réalisés, 100 par journée active → 8 journées
    const account = makeAccount({ initial_balance: 10000, profit_target_pct: 10 });
    const trades = [closedOn('a', '2026-10-05', 100), closedOn('b', '2026-10-07', 100)];
    const result = forecastTarget(account, trades, NOW, 'UTC');
    expect(result).toMatchObject({ status: 'estimate', remaining: 800, avgDailyPnl: 100, tradingDays: 8, date: '2026-10-21' });
  });

  it('constate l’objectif atteint', () => {
    const account = makeAccount({ initial_balance: 10000, profit_target_pct: 10 });
    const trades = [closedOn('a', '2026-10-05', 600), closedOn('b', '2026-10-07', 600)];
    expect(forecastTarget(account, trades, NOW, 'UTC')).toMatchObject({ status: 'reached', remaining: -200 });
  });

  it('ne fait pas de prévision quand le rythme récent est négatif', () => {
    const account = makeAccount({ initial_balance: 10000, profit_target_pct: 10 });
    const trades = [closedOn('a', '2026-10-05', -50), closedOn('b', '2026-10-07', -50)];
    const result = forecastTarget(account, trades, NOW, 'UTC');
    expect(result.status).toBe('negative');
    expect(result.date).toBeNull();
  });

  it('signale l’absence de données récentes', () => {
    const account = makeAccount({ initial_balance: 10000, profit_target_pct: 10 });
    const trades = [closedOn('ancien', '2026-08-01', 300)];
    expect(forecastTarget(account, trades, NOW, 'UTC').status).toBe('no-data');
  });
});
