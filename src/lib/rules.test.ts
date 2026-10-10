import { describe, expect, it } from 'vitest';
import { evaluateAccount, hasAnyRule, levelFromRatio, resolveAmount } from './rules';
import { makeAccount, makeTrade } from '../test/fixtures';

const day = (d: number, hour = 10) => `2026-10-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
const NOW = new Date('2026-10-09T15:00:00.000Z');

describe('montants et niveaux', () => {
  it('privilégie le montant sur le pourcentage', () => {
    expect(resolveAmount(1500, 10, 10000)).toBe(1500);
    expect(resolveAmount(null, 10, 10000)).toBe(1000);
    expect(resolveAmount(null, null, 10000)).toBeNull();
    expect(resolveAmount(0, null, 10000)).toBeNull();
  });

  it('détecte si un compte a au moins une règle', () => {
    expect(hasAnyRule(makeAccount())).toBe(false);
    expect(hasAnyRule(makeAccount({ min_trading_days: 3 }))).toBe(true);
    expect(hasAnyRule(makeAccount({ daily_loss_pct: 5 }))).toBe(true);
  });

  it('convertit un ratio en niveau d’alerte', () => {
    expect(levelFromRatio(0.49)).toBe('ok');
    expect(levelFromRatio(0.5)).toBe('warning');
    expect(levelFromRatio(0.8)).toBe('danger');
    expect(levelFromRatio(1)).toBe('breached');
  });
});

describe('drawdown maximum', () => {
  it('signale une violation du drawdown statique', () => {
    const account = makeAccount({ max_loss_pct: 10 }); // 1 000 USD sous 10 000
    const trades = [makeTrade({ id: 'a', gross_pnl: -600, closed_at: day(5) }), makeTrade({ id: 'b', gross_pnl: -500, closed_at: day(5, 11) })];
    const report = evaluateAccount(account, trades, NOW);
    const gauge = report.gauges.find((g) => g.key === 'maxLoss');
    expect(report.floor).toBe(9000);
    expect(gauge?.value).toBe(1100);
    expect(gauge?.level).toBe('breached');
    expect(report.overall).toBe('breached');
    expect(report.alerts).toContain('Drawdown maximum atteint');
  });

  it('suit le plus haut de l’équité en mode trailing', () => {
    const trailing = makeAccount({ max_loss_amount: 1000, drawdown_type: 'trailing' });
    const trades = [makeTrade({ id: 'a', gross_pnl: 500, closed_at: day(5) }), makeTrade({ id: 'b', gross_pnl: -600, closed_at: day(5, 11) })];
    // Pic à 10 500 → seuil à 9 500 ; équité à 9 900 → 400 de marge, 600 consommés
    const report = evaluateAccount(trailing, trades, NOW);
    expect(report.floor).toBe(9500);
    expect(report.gauges.find((g) => g.key === 'maxLoss')?.level).toBe('warning');

    const statik = evaluateAccount({ ...trailing, drawdown_type: 'static' }, trades, NOW);
    expect(statik.gauges.find((g) => g.key === 'maxLoss')?.level).toBe('ok');
  });

  it('bloque le seuil trailing au solde initial', () => {
    const trailing = makeAccount({ max_loss_amount: 1000, drawdown_type: 'trailing' });
    const trades = [makeTrade({ id: 'a', gross_pnl: 2000, closed_at: day(5) }), makeTrade({ id: 'b', gross_pnl: -1500, closed_at: day(5, 11) })];
    // Pic à 12 000 → seuil plafonné à 10 000 (solde initial) ; équité à 10 500 → 500 consommés
    const report = evaluateAccount(trailing, trades, NOW);
    expect(report.floor).toBe(10000);
    expect(report.gauges.find((g) => g.key === 'maxLoss')?.value).toBe(500);
  });
});

describe('perte journalière et objectif', () => {
  it('ne compte que les pertes du jour courant (fuseau du compte)', () => {
    const account = makeAccount({ daily_loss_pct: 5 }); // 500 USD
    const trades = [
      makeTrade({ id: 'hier', gross_pnl: -1000, closed_at: day(8) }),
      makeTrade({ id: 'a', gross_pnl: -300, closed_at: day(9, 9) }),
      makeTrade({ id: 'b', gross_pnl: -250, closed_at: day(9, 10) }),
    ];
    const report = evaluateAccount(account, trades, NOW);
    const gauge = report.gauges.find((g) => g.key === 'daily');
    expect(report.todayPnl).toBe(-550);
    expect(gauge?.value).toBe(550);
    expect(gauge?.level).toBe('breached');
    expect(report.alerts).toContain('Limite de perte journalière atteinte');
  });

  it('signale l’objectif de profit atteint', () => {
    const account = makeAccount({ profit_target_amount: 1000 });
    const report = evaluateAccount(account, [makeTrade({ id: 'a', gross_pnl: 600, closed_at: day(5) }), makeTrade({ id: 'b', gross_pnl: 500, closed_at: day(6) })], NOW);
    const gauge = report.gauges.find((g) => g.key === 'target');
    expect(gauge?.ratio).toBeCloseTo(1.1);
    expect(gauge?.remaining).toBe(0);
    expect(report.alerts).toContain('Objectif de profit atteint');
    expect(report.overall).toBe('ok');
  });
});

describe('jours minimum et cohérence', () => {
  it('suit le nombre de jours de trading', () => {
    const account = makeAccount({ min_trading_days: 3 });
    const report = evaluateAccount(account, [makeTrade({ id: 'a', gross_pnl: 10, closed_at: day(5) }), makeTrade({ id: 'b', gross_pnl: 10, closed_at: day(6) })], NOW);
    const gauge = report.gauges.find((g) => g.key === 'days');
    expect(gauge?.value).toBe(2);
    expect(gauge?.remaining).toBe(1);
    expect(gauge?.level).toBe('ok');
  });

  it('détecte un meilleur jour trop important', () => {
    const account = makeAccount({ consistency_pct: 30 });
    const trades = [makeTrade({ id: 'a', gross_pnl: 800, closed_at: day(5) }), makeTrade({ id: 'b', gross_pnl: 200, closed_at: day(6) })];
    const report = evaluateAccount(account, trades, NOW);
    const gauge = report.gauges.find((g) => g.key === 'consistency');
    expect(gauge?.value).toBeCloseTo(80);
    expect(gauge?.level).toBe('breached');
    expect(report.alerts).toContain('Règle de cohérence dépassée (meilleur jour trop important)');
  });

  it('ignore la cohérence tant que le compte est en perte', () => {
    const account = makeAccount({ consistency_pct: 30 });
    const report = evaluateAccount(account, [makeTrade({ id: 'a', gross_pnl: -100, closed_at: day(5) })], NOW);
    expect(report.gauges.some((g) => g.key === 'consistency')).toBe(false);
  });

  it('retourne un rapport neutre sans règle', () => {
    const report = evaluateAccount(makeAccount(), [], NOW);
    expect(report.hasRules).toBe(false);
    expect(report.overall).toBe('ok');
    expect(report.equity).toBe(10000);
  });
});

describe('P&L flottant (positions ouvertes)', () => {
  const open = (id: string, pnl: number) => makeTrade({ id, gross_pnl: pnl, closed_at: null });

  it('sépare le réalisé du flottant', () => {
    const trades = [makeTrade({ id: 'c', gross_pnl: 200, closed_at: day(5) }), open('o', -50)];
    const report = evaluateAccount(makeAccount(), trades, NOW);
    expect(report.netPnl).toBe(200);
    expect(report.floatingPnl).toBe(-50);
    expect(report.openCount).toBe(1);
    expect(report.equity).toBe(10200);
    expect(report.equityWithFloating).toBe(10150);
  });

  it('ne compte pas une position ouverte parmi les jours de trading', () => {
    const trades = [makeTrade({ id: 'c', gross_pnl: 10, closed_at: day(5) }), open('o', 10)];
    expect(evaluateAccount(makeAccount({ min_trading_days: 1 }), trades, NOW).tradingDays).toBe(1);
  });

  it('intègre le flottant à la limite de perte journalière', () => {
    const account = makeAccount({ daily_loss_amount: 500 });
    const trades = [makeTrade({ id: 'c', gross_pnl: -100, closed_at: day(9) }), open('o', -300)];
    const gauge = evaluateAccount(account, trades, NOW).gauges.find((g) => g.key === 'daily');
    expect(gauge?.value).toBeCloseTo(400);
    expect(gauge?.level).toBe('danger');
    expect(gauge?.remaining).toBeCloseTo(100);
  });

  it('mesure le drawdown sur l’équité avec flottant', () => {
    const account = makeAccount({ max_loss_amount: 1000 });
    const trades = [makeTrade({ id: 'c', gross_pnl: -200, closed_at: day(5) }), open('o', -500)];
    const report = evaluateAccount(account, trades, NOW);
    const gauge = report.gauges.find((g) => g.key === 'maxLoss');
    expect(report.floor).toBe(9000);
    expect(gauge?.remaining).toBeCloseTo(300);
    expect(gauge?.level).toBe('warning');
  });

  it('signale les positions ouvertes dans les alertes', () => {
    const report = evaluateAccount(makeAccount(), [open('a', -20), open('b', 5)], NOW);
    expect(report.alerts[0]).toContain('2 positions ouvertes');
    expect(report.alerts[0]).toContain('-15.00');
  });
});
