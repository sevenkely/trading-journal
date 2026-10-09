export type AccountKind = 'personal' | 'evaluation' | 'funded';
export type AccountStatus = 'active' | 'passed' | 'failed' | 'archived';
export type DrawdownType = 'static' | 'trailing';
export type Direction = 'long' | 'short';
export type TradeSource = 'manual' | 'import';
export type ImportSource = 'mt5' | 'ninjatrader' | 'tradingview' | 'csv';

export interface Profile {
  id: string;
  display_name: string | null;
  default_timezone: string;
  default_currency: string;
  checklist: string[];
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  status: AccountStatus;
  firm: string | null;
  platform: string | null;
  currency: string;
  initial_balance: number;
  /** Fuseau qui découpe les journées (perte journalière, jours de trading). */
  day_timezone: string;
  daily_loss_amount: number | null;
  daily_loss_pct: number | null;
  max_loss_amount: number | null;
  max_loss_pct: number | null;
  drawdown_type: DrawdownType;
  profit_target_amount: number | null;
  profit_target_pct: number | null;
  min_trading_days: number;
  /** Part maximale (%) du profit total réalisée sur le meilleur jour. */
  consistency_pct: number | null;
  created_at: string;
}

export type AccountInput = Omit<Account, 'id' | 'created_at'>;

export interface TradeInput {
  account_id: string;
  instrument: string;
  direction: Direction;
  opened_at: string;
  closed_at: string | null;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  size: number | null;
  risk_amount: number | null;
  gross_pnl: number;
  /** Coûts positifs (commissions, frais, swap négatif). Un swap positif réduit les frais. */
  fees: number;
  session: string | null;
  setup: string | null;
  timeframe: string | null;
  emotions_before: string[];
  emotions_after: string[];
  plan_respected: boolean | null;
  mistakes: string[];
  checklist_done: string[];
  notes: string | null;
  tags: string[];
  source: TradeSource;
  external_id: string | null;
  import_batch_id: string | null;
}

export interface Trade extends TradeInput {
  id: string;
  /** Calculé en base : gross_pnl - fees */
  net_pnl: number;
  screenshots: string[];
  created_at: string;
}

export interface DailyNote {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  mood: number | null;
  rating: number | null;
  plan: string | null;
  review: string | null;
  lessons: string | null;
}

export type DailyNoteInput = Omit<DailyNote, 'id'>;

export interface ImportBatch {
  id: string;
  account_id: string;
  source: ImportSource;
  filename: string | null;
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  created_at: string;
}

export type ImportBatchInput = Omit<ImportBatch, 'id' | 'created_at'>;
