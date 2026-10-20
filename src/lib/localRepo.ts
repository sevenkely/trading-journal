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
  Setup,
  Trade,
  TradeInput,
} from './types';
import { normalizeMedia } from './story';
import { normalizeSetupName } from './setups';
import { newId, round2 } from './utils';

/** Mode démo : tout est stocké dans le localStorage du navigateur. */
const PREFIX = 'tj-demo:';

function read<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(name: string, value: T): void {
  localStorage.setItem(PREFIX + name, JSON.stringify(value));
}

const nowIso = () => new Date().toISOString();

/** Le mode démo a connu des trades sans dossier : on complète les champs ajoutés depuis. */
function normalizeTrade(trade: Trade & { screenshots?: string[] }): Trade {
  const { screenshots, ...rest } = trade;
  return {
    ...rest,
    setup_id: rest.setup_id ?? null,
    thesis: rest.thesis ?? null,
    invalidation: rest.invalidation ?? null,
    verdict: rest.verdict ?? null,
    confluences: rest.confluences ?? [],
    media: normalizeMedia(rest.media, screenshots),
  };
}

function buildTrade(input: TradeInput, existing?: Trade, id?: string): Trade {
  const base: Partial<Trade> & { id: string; created_at: string } =
    existing ??
    ({
      id: id ?? newId(),
      media: [],
      setup_id: null,
      thesis: null,
      invalidation: null,
      verdict: null,
      confluences: [],
      created_at: nowIso(),
    } as Partial<Trade> & { id: string; created_at: string });
  const merged = { ...base, ...input } as Trade;
  const gross = Number(merged.gross_pnl);
  const fees = Number(merged.fees);
  return {
    ...merged,
    media: normalizeMedia(merged.media),
    confluences: merged.confluences ?? [],
    gross_pnl: gross,
    fees,
    net_pnl: round2(gross - fees),
  } as Trade;
}

export function createLocalRepo(): Repo {
  return {
    supportsScreenshots: false,

    async getProfile() {
      const existing = read<Profile | null>('profile', null);
      if (existing) return existing;
      const profile: Profile = {
        id: 'local',
        display_name: null,
        default_timezone: DEFAULT_TIMEZONE,
        default_currency: DEFAULT_CURRENCY,
        checklist: [...DEFAULT_CHECKLIST],
      };
      write('profile', profile);
      return profile;
    },

    async updateProfile(patch) {
      const current = read<Profile>('profile', {
        id: 'local',
        display_name: null,
        default_timezone: DEFAULT_TIMEZONE,
        default_currency: DEFAULT_CURRENCY,
        checklist: [...DEFAULT_CHECKLIST],
      });
      const next = { ...current, ...patch };
      write('profile', next);
      return next;
    },

    async listAccounts() {
      return read<Account[]>('accounts', []);
    },

    async createAccount(input: AccountInput) {
      const accounts = read<Account[]>('accounts', []);
      const account: Account = { ...input, id: newId(), created_at: nowIso() };
      write('accounts', [...accounts, account]);
      return account;
    },

    async updateAccount(id, patch) {
      const accounts = read<Account[]>('accounts', []);
      const index = accounts.findIndex((a) => a.id === id);
      if (index < 0) throw new Error('Compte introuvable');
      const updated = { ...accounts[index], ...patch };
      accounts[index] = updated;
      write('accounts', accounts);
      return updated;
    },

    async deleteAccount(id) {
      write('accounts', read<Account[]>('accounts', []).filter((a) => a.id !== id));
      write('trades', read<Trade[]>('trades', []).filter((t) => t.account_id !== id));
      write('batches', read<ImportBatch[]>('batches', []).filter((b) => b.account_id !== id));
    },

    async listTrades(options) {
      const trades = read<Trade[]>('trades', []).map(normalizeTrade);
      const limit = options?.limit;
      if (!limit || limit <= 0 || trades.length <= limit) return trades;
      return [...trades]
        .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
        .slice(0, limit);
    },

    async createTrade(input, extra) {
      const trades = read<Trade[]>('trades', []);
      const trade = buildTrade(input, undefined, extra?.id);
      write('trades', [...trades, trade]);
      return trade;
    },

    async updateTrade(id, patch) {
      const trades = read<Trade[]>('trades', []);
      const index = trades.findIndex((t) => t.id === id);
      if (index < 0) throw new Error('Trade introuvable');
      const updated = buildTrade({ ...trades[index], ...patch } as TradeInput, trades[index]);
      trades[index] = updated;
      write('trades', trades);
      return updated;
    },

    async deleteTrades(ids) {
      const set = new Set(ids);
      write('trades', read<Trade[]>('trades', []).filter((t) => !set.has(t.id)));
    },

    async insertTrades(inputs) {
      const trades = read<Trade[]>('trades', []);
      write('trades', [...trades, ...inputs.map((input) => buildTrade(input))]);
      return inputs.length;
    },

    async listImportBatches() {
      return read<ImportBatch[]>('batches', []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async createImportBatch(input: ImportBatchInput) {
      const batches = read<ImportBatch[]>('batches', []);
      const batch: ImportBatch = { ...input, id: newId(), created_at: nowIso() };
      write('batches', [...batches, batch]);
      return batch;
    },

    async deleteImportBatch(id) {
      write('batches', read<ImportBatch[]>('batches', []).filter((b) => b.id !== id));
      write('trades', read<Trade[]>('trades', []).filter((t) => t.import_batch_id !== id));
    },

    async listDailyNotes() {
      return read<DailyNote[]>('notes', []);
    },

    async upsertDailyNote(input: DailyNoteInput) {
      const notes = read<DailyNote[]>('notes', []);
      const index = notes.findIndex((n) => n.date === input.date);
      if (index >= 0) {
        notes[index] = { ...notes[index], ...input };
        write('notes', notes);
        return notes[index];
      }
      const note: DailyNote = { ...input, id: newId() };
      write('notes', [...notes, note]);
      return note;
    },

    async listSetups() {
      return read<Setup[]>('setups', []).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    },

    async createSetup(input) {
      const setups = read<Setup[]>('setups', []);
      const setup: Setup = { ...input, name: normalizeSetupName(input.name), id: newId(), created_at: nowIso() };
      write('setups', [...setups, setup]);
      return setup;
    },

    async updateSetup(id, patch) {
      const setups = read<Setup[]>('setups', []);
      const index = setups.findIndex((s) => s.id === id);
      if (index < 0) throw new Error('Setup introuvable');
      const next = { ...setups[index], ...patch };
      const updated: Setup = { ...next, name: normalizeSetupName(next.name) };
      setups[index] = updated;
      write('setups', setups);
      return updated;
    },

    async deleteSetup(id) {
      write('setups', read<Setup[]>('setups', []).filter((s) => s.id !== id));
      // Le libellé des trades reste : le setup disparaît de la bibliothèque, pas de l'historique.
      write(
        'trades',
        read<Trade[]>('trades', []).map((t) => (t.setup_id === id ? { ...t, setup_id: null } : t)),
      );
    },

    async uploadScreenshot() {
      throw new Error('Les captures d’écran sont disponibles uniquement avec Supabase connecté.');
    },

    async getScreenshotUrl() {
      return '';
    },

    async deleteScreenshotFile() {
      /* rien à supprimer en mode démo */
    },
  };
}
