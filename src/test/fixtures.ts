import type { Account, AccountInput, Trade, TradeInput } from '../lib/types';

/** Données de test : compte de 10 000 USD, sans règle par défaut. */
export function accountInput(overrides: Partial<AccountInput> = {}): AccountInput {
  return {
    name: 'Compte test',
    kind: 'evaluation',
    status: 'active',
    firm: 'FTMO',
    platform: 'MetaTrader 5',
    currency: 'USD',
    initial_balance: 10000,
    day_timezone: 'UTC',
    daily_loss_amount: null,
    daily_loss_pct: null,
    max_loss_amount: null,
    max_loss_pct: null,
    drawdown_type: 'static',
    profit_target_amount: null,
    profit_target_pct: null,
    min_trading_days: 0,
    consistency_pct: null,
    ...overrides,
  };
}

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'a1', created_at: '2026-01-01T00:00:00.000Z', ...accountInput(), ...overrides };
}

export function tradeInput(overrides: Partial<TradeInput> = {}): TradeInput {
  return {
    account_id: 'a1',
    instrument: 'EURUSD',
    direction: 'long',
    opened_at: '2026-10-05T08:00:00.000Z',
    closed_at: '2026-10-05T09:00:00.000Z',
    entry_price: null,
    exit_price: null,
    stop_loss: null,
    take_profit: null,
    size: null,
    risk_amount: null,
    gross_pnl: 0,
    fees: 0,
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
    ...overrides,
  };
}

/** Trade complet : net_pnl = gross_pnl − fees, comme la base de données. */
export function makeTrade(overrides: Partial<Trade> = {}): Trade {
  const input = tradeInput(overrides);
  const gross = overrides.gross_pnl ?? input.gross_pnl;
  const fees = overrides.fees ?? input.fees;
  return {
    ...input,
    id: overrides.id ?? 'trade',
    gross_pnl: gross,
    fees,
    net_pnl: overrides.net_pnl ?? Math.round((gross - fees) * 100) / 100,
    screenshots: overrides.screenshots ?? [],
    created_at: overrides.created_at ?? '2026-10-05T09:00:00.000Z',
  };
}
