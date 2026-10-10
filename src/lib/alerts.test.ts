import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALERT_SETTINGS,
  alertBody,
  alertKey,
  parseAlertSettings,
  parseAlertState,
  pendingAlerts,
  pruneAlertState,
  serializeAlertSettings,
  webhookBody,
  type AccountReport,
} from './alerts';
import { evaluateAccount } from './rules';
import { makeAccount, makeTrade } from '../test/fixtures';

const NOW = new Date('2026-10-09T15:00:00.000Z');
const DAY = '2026-10-09';

function entry(dailyLimit: number, loss: number, overrides: Parameters<typeof makeAccount>[0] = {}): AccountReport {
  const account = makeAccount({ id: 'a1', name: 'FTMO Test', daily_loss_amount: dailyLimit, ...overrides });
  const trades = [makeTrade({ id: 't', gross_pnl: loss, closed_at: '2026-10-09T10:00:00.000Z' })];
  return { accountId: account.id, accountName: account.name, currency: account.currency, report: evaluateAccount(account, trades, NOW) };
}

describe('réglages d’alerte', () => {
  it('retombe sur les valeurs par défaut si le réglage est absent ou abîmé', () => {
    expect(parseAlertSettings(null)).toEqual(DEFAULT_ALERT_SETTINGS);
    expect(parseAlertSettings('{')).toEqual(DEFAULT_ALERT_SETTINGS);
    expect(parseAlertSettings('{"browser":"oui","minLevel":"niveau"}')).toEqual(DEFAULT_ALERT_SETTINGS);
  });

  it('relit ce qui a été écrit', () => {
    const settings = { browser: true, webhookUrl: 'https://exemple.test/hook', minLevel: 'warning' as const, muted: ['a1'] };
    expect(parseAlertSettings(serializeAlertSettings(settings))).toEqual(settings);
  });

  it('ignore les entrées de mémoire invalides et les autres journées', () => {
    const state = parseAlertState(JSON.stringify({ [alertKey(DAY, 'a1', 'daily')]: 'danger', x: 'inconnu' }));
    expect(state).toEqual({ [alertKey(DAY, 'a1', 'daily')]: 'danger' });
    expect(pruneAlertState({ ...state, '2026-10-08|a1|daily': 'warning' }, DAY)).toEqual(state);
  });
});

describe('déclenchement à front', () => {
  const settings = { ...DEFAULT_ALERT_SETTINGS, minLevel: 'warning' as const };

  it('n’émet rien sous le niveau demandé', () => {
    const result = pendingAlerts([entry(1000, -100)], DAY, settings, {});
    expect(result.alerts).toEqual([]);
  });

  it('émet une fois par palier, puis se tait', () => {
    const danger = pendingAlerts([entry(1000, -850)], DAY, settings, {});
    expect(danger.alerts.map((a) => a.level)).toContain('danger');

    const again = pendingAlerts([entry(1000, -850)], DAY, settings, danger.state);
    expect(again.alerts).toEqual([]);

    const breached = pendingAlerts([entry(1000, -1100)], DAY, settings, danger.state);
    expect(breached.alerts.map((a) => a.level)).toContain('breached');
  });

  it('un seuil plus élevé ne relance pas un niveau déjà notifié, mais le franchissement si', () => {
    const strict = { ...DEFAULT_ALERT_SETTINGS, minLevel: 'breached' as const };
    expect(pendingAlerts([entry(1000, -850)], DAY, strict, {}).alerts).toEqual([]);
    expect(pendingAlerts([entry(1000, -1100)], DAY, strict, {}).alerts.length).toBeGreaterThan(0);
  });

  it('repart de zéro le lendemain', () => {
    const first = pendingAlerts([entry(1000, -850)], DAY, settings, {});
    expect(first.alerts.length).toBeGreaterThan(0);
    const nextDay = pendingAlerts([entry(1000, -850)], '2026-10-10', settings, first.state);
    expect(nextDay.alerts.length).toBeGreaterThan(0);
  });

  it('ne surveille pas un compte mis en sourdine', () => {
    const muted = { ...settings, muted: ['a1'] };
    expect(pendingAlerts([entry(1000, -1100)], DAY, muted, {}).alerts).toEqual([]);
  });
});

describe('message et charge utile', () => {
  it('décrit la marge restante d’une limite de risque', () => {
    const [payload] = pendingAlerts([entry(1000, -850)], DAY, { ...DEFAULT_ALERT_SETTINGS, minLevel: 'danger' }, {}).alerts;
    expect(payload.body).toContain('marge restante');
    expect(payload.title).toContain('FTMO Test');
  });

  it('produit un JSON plat pour le webhook', () => {
    const [payload] = pendingAlerts([entry(1000, -1100)], DAY, { ...DEFAULT_ALERT_SETTINGS, minLevel: 'danger' }, {}).alerts;
    const body = JSON.parse(webhookBody(payload, DAY)) as Record<string, unknown>;
    expect(body.type).toBe('trading-journal.rule-alert');
    expect(body.day).toBe(DAY);
    expect(body.level).toBe('breached');
  });

  it('formate le corps d’une jauge de progression', () => {
    const account = makeAccount({ profit_target_amount: 1000 });
    const trades = [makeTrade({ id: 't', gross_pnl: 1200, closed_at: '2026-10-09T10:00:00.000Z' })];
    const report = evaluateAccount(account, trades, NOW);
    const gauge = report.gauges.find((g) => g.key === 'target');
    expect(gauge).toBeDefined();
    expect(alertBody(gauge!, 'USD')).toContain('Objectif atteint');
  });
});
