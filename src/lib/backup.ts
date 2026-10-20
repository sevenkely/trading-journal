import type { Repo } from './repo';
import type { Account, AccountInput, DailyNote, DailyNoteInput, Trade, TradeInput } from './types';

export const BACKUP_APP = 'trading-journal';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  accounts: Account[];
  trades: Trade[];
  notes: DailyNote[];
}

/** Construit la sauvegarde. Les images (fichiers hébergés) et les lots d’import ne sont pas inclus. */
export function buildBackup(accounts: Account[], trades: Trade[], notes: DailyNote[], now = new Date()): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    accounts: accounts.map((a) => ({ ...a })),
    trades: trades.map((t) => ({ ...t, media: [], import_batch_id: null })),
    notes: notes.map((n) => ({ ...n })),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Lit une sauvegarde JSON et vérifie sa structure. Lève une erreur au message lisible sinon. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Le fichier n’est pas du JSON valide.');
  }
  if (!isObject(data) || data.app !== BACKUP_APP) {
    throw new Error('Ce fichier n’est pas une sauvegarde du journal.');
  }
  if (data.version !== BACKUP_VERSION) {
    throw new Error(`Version de sauvegarde non prise en charge (${String(data.version)}).`);
  }
  for (const section of ['accounts', 'trades', 'notes'] as const) {
    if (!Array.isArray(data[section])) throw new Error(`Section « ${section} » absente de la sauvegarde.`);
  }

  const accounts = data.accounts as unknown[];
  const trades = data.trades as unknown[];
  const notes = data.notes as unknown[];
  const invalid = (what: string): never => {
    throw new Error(`Sauvegarde invalide : ${what}.`);
  };
  accounts.forEach((a, i) => {
    if (!isObject(a) || typeof a.id !== 'string' || typeof a.name !== 'string' || typeof a.initial_balance !== 'number') {
      invalid(`compte n°${i + 1} incomplet`);
    }
  });
  trades.forEach((t, i) => {
    if (
      !isObject(t) ||
      typeof t.id !== 'string' ||
      typeof t.account_id !== 'string' ||
      typeof t.instrument !== 'string' ||
      typeof t.opened_at !== 'string' ||
      typeof t.gross_pnl !== 'number' ||
      typeof t.fees !== 'number'
    ) {
      invalid(`trade n°${i + 1} incomplet`);
    }
  });
  notes.forEach((n, i) => {
    if (!isObject(n) || typeof n.date !== 'string') invalid(`note n°${i + 1} incomplète`);
  });

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    accounts: accounts as Account[],
    trades: trades as Trade[],
    notes: notes as DailyNote[],
  };
}

export interface RestoreAccount {
  backupId: string;
  /** Compte déjà présent (même nom, sans tenir compte de la casse), ou null si à créer. */
  existingId: string | null;
  input: AccountInput;
}

export interface RestorePlan {
  accounts: RestoreAccount[];
  trades: { accountBackupId: string; input: Omit<TradeInput, 'account_id'> }[];
  notes: DailyNoteInput[];
  skippedTrades: number;
  skippedNotes: number;
}

function withoutKeys<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Omit<T, K> {
  const copy: Partial<T> = { ...source };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}

const signature = (accountId: string, opened: string, instrument: string, gross: number, fees: number): string =>
  `${accountId}|${new Date(opened).getTime()}|${instrument}|${Math.round(gross * 100)}|${Math.round(fees * 100)}`;

/**
 * Décide ce qui sera ajouté : les comptes sont reconnus par leur nom, les trades déjà présents
 * (même compte, même ouverture, même instrument et mêmes montants) sont ignorés, et les notes
 * d’un jour déjà renseigné ne sont jamais écrasées. Restaurer deux fois ne duplique donc rien.
 */
export function planRestore(
  backup: BackupFile,
  existingAccounts: Account[],
  existingTrades: Trade[],
  existingNotes: DailyNote[],
): RestorePlan {
  const byName = new Map(existingAccounts.map((a) => [a.name.trim().toLowerCase(), a]));
  const accounts: RestoreAccount[] = backup.accounts.map((a) => ({
    backupId: a.id,
    existingId: byName.get(a.name.trim().toLowerCase())?.id ?? null,
    input: withoutKeys(a, ['id', 'created_at']),
  }));
  const targetOf = new Map(accounts.map((a) => [a.backupId, a.existingId]));

  const known = new Set(
    existingTrades.map((t) => signature(t.account_id, t.opened_at, t.instrument, t.gross_pnl, t.fees)),
  );
  let skippedTrades = 0;
  const trades: RestorePlan['trades'] = [];
  for (const t of backup.trades) {
    if (!targetOf.has(t.account_id)) {
      skippedTrades += 1; // trade orphelin : son compte n’est pas dans la sauvegarde
      continue;
    }
    const existingId = targetOf.get(t.account_id) ?? null;
    if (existingId && known.has(signature(existingId, t.opened_at, t.instrument, t.gross_pnl, t.fees))) {
      skippedTrades += 1;
      continue;
    }
    // Les setups de la bibliothèque ne sont pas dans la sauvegarde : le libellé reste, le lien saute.
    const rest = withoutKeys(t, [
      'id',
      'net_pnl',
      'media',
      'created_at',
      'account_id',
      'import_batch_id',
      'setup_id',
    ]);
    trades.push({ accountBackupId: t.account_id, input: { ...rest, import_batch_id: null } });
  }

  const knownDates = new Set(existingNotes.map((n) => n.date));
  const notes: DailyNoteInput[] = [];
  let skippedNotes = 0;
  for (const n of backup.notes) {
    if (knownDates.has(n.date)) {
      skippedNotes += 1;
      continue;
    }
    notes.push(withoutKeys(n, ['id']));
  }

  return { accounts, trades, notes, skippedTrades, skippedNotes };
}

export interface RestoreResult {
  accountsCreated: number;
  accountsReused: number;
  tradesAdded: number;
  tradesSkipped: number;
  notesRestored: number;
  notesSkipped: number;
}

/** Exécute la restauration via le dépôt (mode démo comme Supabase). */
export async function restoreBackup(repo: Repo, plan: RestorePlan): Promise<RestoreResult> {
  const targetId = new Map<string, string>();
  let accountsCreated = 0;
  for (const a of plan.accounts) {
    if (a.existingId) {
      targetId.set(a.backupId, a.existingId);
      continue;
    }
    const created = await repo.createAccount(a.input);
    targetId.set(a.backupId, created.id);
    accountsCreated += 1;
  }

  const inputs: TradeInput[] = [];
  for (const t of plan.trades) {
    const accountId = targetId.get(t.accountBackupId);
    if (accountId) inputs.push({ ...t.input, account_id: accountId });
  }
  const tradesAdded = inputs.length > 0 ? await repo.insertTrades(inputs) : 0;

  for (const n of plan.notes) {
    await repo.upsertDailyNote(n);
  }

  return {
    accountsCreated,
    accountsReused: plan.accounts.length - accountsCreated,
    tradesAdded,
    tradesSkipped: plan.skippedTrades,
    notesRestored: plan.notes.length,
    notesSkipped: plan.skippedNotes,
  };
}
