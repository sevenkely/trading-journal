import type {
  Account,
  AccountInput,
  DailyNote,
  DailyNoteInput,
  ImportBatch,
  ImportBatchInput,
  Profile,
  Setup,
  SetupInput,
  Trade,
  TradeInput,
} from './types';

/**
 * Contrat d'accès aux données. Deux implémentations :
 * - createSupabaseRepo : base Supabase (multi-utilisateur, sécurisée par RLS)
 * - createLocalRepo : mode démo dans le navigateur (localStorage)
 */
export interface ListTradesOptions {
  /** Nombre maximum de trades renvoyés, en partant des plus récents */
  limit?: number;
}

export interface Repo {
  readonly supportsScreenshots: boolean;

  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<Profile>;

  listAccounts(): Promise<Account[]>;
  createAccount(input: AccountInput): Promise<Account>;
  updateAccount(id: string, patch: Partial<AccountInput>): Promise<Account>;
  deleteAccount(id: string): Promise<void>;

  /**
   * `options.limit` : ne charge que les trades les plus récents (les pages d'agrégat, elles,
   * ont besoin de tout l'historique pour leurs statistiques).
   */
  listTrades(options?: ListTradesOptions): Promise<Trade[]>;
  /**
   * `extra.id` : identifiant choisi à l'avance — les captures sont envoyées avant le trade,
   * dans son dossier, et `input.media` les référence avec leur rôle.
   */
  createTrade(input: TradeInput, extra?: { id?: string }): Promise<Trade>;
  updateTrade(id: string, patch: Partial<TradeInput>): Promise<Trade>;
  deleteTrades(ids: string[]): Promise<void>;
  insertTrades(inputs: TradeInput[]): Promise<number>;

  listImportBatches(): Promise<ImportBatch[]>;
  createImportBatch(input: ImportBatchInput): Promise<ImportBatch>;
  /** Supprime l'import et tous les trades qu'il a créés */
  deleteImportBatch(id: string): Promise<void>;

  listDailyNotes(): Promise<DailyNote[]>;
  upsertDailyNote(input: DailyNoteInput): Promise<DailyNote>;

  /** Bibliothèque de setups, du plus récent au plus ancien. */
  listSetups(): Promise<Setup[]>;
  createSetup(input: SetupInput): Promise<Setup>;
  updateSetup(id: string, patch: Partial<SetupInput>): Promise<Setup>;
  /** Les trades rattachés gardent leur libellé : la suppression ne les efface pas. */
  deleteSetup(id: string): Promise<void>;

  /** Retourne le chemin de stockage de la capture */
  uploadScreenshot(tradeId: string, file: File): Promise<string>;
  getScreenshotUrl(path: string): Promise<string>;
  deleteScreenshotFile(path: string): Promise<void>;
}
