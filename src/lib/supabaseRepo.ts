import type { SupabaseClient } from '@supabase/supabase-js';
import type { Repo } from './repo';
import { DEFAULT_CHECKLIST, DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from './constants';
import type {
  Account,
  AccountInput,
  DailyNote,
  DailyNoteInput,
  ImportBatch,
  ImportBatchInput,
  Profile,
  Trade,
  TradeInput,
} from './types';
import { newId } from './utils';

const PAGE_SIZE = 1000;
const SCREENSHOT_BUCKET = 'trade-screenshots';

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const orNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** PostgREST peut renvoyer des numériques sous forme de chaînes : on normalise. */
function toTrade(row: unknown): Trade {
  const r = row as Trade;
  return {
    ...r,
    entry_price: orNull(r.entry_price),
    exit_price: orNull(r.exit_price),
    stop_loss: orNull(r.stop_loss),
    take_profit: orNull(r.take_profit),
    size: orNull(r.size),
    risk_amount: orNull(r.risk_amount),
    gross_pnl: Number(r.gross_pnl),
    fees: Number(r.fees),
    net_pnl: Number(r.net_pnl),
    emotions_before: r.emotions_before ?? [],
    emotions_after: r.emotions_after ?? [],
    mistakes: r.mistakes ?? [],
    checklist_done: r.checklist_done ?? [],
    tags: r.tags ?? [],
    screenshots: r.screenshots ?? [],
  };
}

function toAccount(row: unknown): Account {
  const r = row as Account;
  return {
    ...r,
    initial_balance: Number(r.initial_balance),
    daily_loss_amount: orNull(r.daily_loss_amount),
    daily_loss_pct: orNull(r.daily_loss_pct),
    max_loss_amount: orNull(r.max_loss_amount),
    max_loss_pct: orNull(r.max_loss_pct),
    profit_target_amount: orNull(r.profit_target_amount),
    profit_target_pct: orNull(r.profit_target_pct),
    consistency_pct: orNull(r.consistency_pct),
    min_trading_days: Number(r.min_trading_days ?? 0),
  };
}

export function createSupabaseRepo(sb: SupabaseClient, userId: string): Repo {
  return {
    supportsScreenshots: true,

    async getProfile() {
      const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
      check(error);
      if (data) return data as Profile;
      // Profil absent (ex. compte créé avant la migration) : on le crée à la volée
      const fallback: Profile = {
        id: userId,
        display_name: null,
        default_timezone: DEFAULT_TIMEZONE,
        default_currency: DEFAULT_CURRENCY,
        checklist: [...DEFAULT_CHECKLIST],
      };
      const created = await sb.from('profiles').upsert(fallback).select().single();
      check(created.error);
      return created.data as Profile;
    },

    async updateProfile(patch) {
      const { data, error } = await sb.from('profiles').update(patch).eq('id', userId).select().single();
      check(error);
      return data as Profile;
    },

    async listAccounts() {
      const { data, error } = await sb
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      check(error);
      return (data ?? []).map((row) => toAccount(row));
    },

    async createAccount(input: AccountInput) {
      const { data, error } = await sb.from('accounts').insert({ ...input, user_id: userId }).select().single();
      check(error);
      return toAccount(data);
    },

    async updateAccount(id, patch) {
      const { data, error } = await sb.from('accounts').update(patch).eq('id', id).select().single();
      check(error);
      return toAccount(data);
    },

    async deleteAccount(id) {
      const { error } = await sb.from('accounts').delete().eq('id', id);
      check(error);
    },

    async listTrades() {
      const out: Trade[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await sb
          .from('trades')
          .select('*')
          .eq('user_id', userId)
          .order('opened_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        check(error);
        const rows = data ?? [];
        out.push(...rows.map((row) => toTrade(row)));
        if (rows.length < PAGE_SIZE) break;
      }
      return out;
    },

    async createTrade(input: TradeInput) {
      const { data, error } = await sb.from('trades').insert({ ...input, user_id: userId }).select().single();
      check(error);
      return toTrade(data);
    },

    async updateTrade(id, patch) {
      const { data, error } = await sb.from('trades').update(patch).eq('id', id).select().single();
      check(error);
      return toTrade(data);
    },

    async deleteTrades(ids) {
      if (ids.length === 0) return;
      const { error } = await sb.from('trades').delete().in('id', ids);
      check(error);
    },

    async insertTrades(inputs) {
      for (let i = 0; i < inputs.length; i += 500) {
        const chunk = inputs.slice(i, i + 500).map((t) => ({ ...t, user_id: userId }));
        const { error } = await sb.from('trades').insert(chunk);
        check(error);
      }
      return inputs.length;
    },

    async listImportBatches() {
      const { data, error } = await sb
        .from('import_batches')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      check(error);
      return (data ?? []) as ImportBatch[];
    },

    async createImportBatch(input: ImportBatchInput) {
      const { data, error } = await sb.from('import_batches').insert({ ...input, user_id: userId }).select().single();
      check(error);
      return data as ImportBatch;
    },

    async deleteImportBatch(id) {
      const { error } = await sb.from('import_batches').delete().eq('id', id);
      check(error);
    },

    async listDailyNotes() {
      const { data, error } = await sb
        .from('daily_notes')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
      check(error);
      return (data ?? []) as DailyNote[];
    },

    async upsertDailyNote(input: DailyNoteInput) {
      const { data, error } = await sb
        .from('daily_notes')
        .upsert({ ...input, user_id: userId }, { onConflict: 'user_id,date' })
        .select()
        .single();
      check(error);
      return data as DailyNote;
    },

    async uploadScreenshot(tradeId, file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const path = `${userId}/${tradeId}/${newId()}-${safeName}`;
      const { error } = await sb.storage
        .from(SCREENSHOT_BUCKET)
        .upload(path, file, { contentType: file.type || 'image/png', upsert: false });
      check(error);
      return path;
    },

    async getScreenshotUrl(path) {
      const { data, error } = await sb.storage.from(SCREENSHOT_BUCKET).createSignedUrl(path, 3600);
      check(error);
      return data?.signedUrl ?? '';
    },

    async deleteScreenshotFile(path) {
      const { error } = await sb.storage.from(SCREENSHOT_BUCKET).remove([path]);
      check(error);
    },
  };
}
