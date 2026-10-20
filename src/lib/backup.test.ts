import { describe, expect, it } from 'vitest';
import { makeAccount, makeTrade } from '../test/fixtures';
import type { Repo } from './repo';
import type { Account, AccountInput, DailyNote, DailyNoteInput, TradeInput } from './types';
import { BACKUP_APP, buildBackup, parseBackup, planRestore, restoreBackup } from './backup';

const note = (id: string, date: string, review: string): DailyNote => ({
  id,
  date,
  mood: 3,
  rating: 4,
  plan: null,
  review,
  lessons: null,
});

function sampleData() {
  const accounts: Account[] = [makeAccount({ id: 'a1', name: 'FTMO 100k', initial_balance: 100000 })];
  const trades = [
    makeTrade({
      id: 't1',
      account_id: 'a1',
      instrument: 'EURUSD',
      opened_at: '2026-10-05T08:00:00.000Z',
      gross_pnl: 150,
      fees: 4,
      media: [{ path: 'u1/a1/capture.png', role: 'htf', caption: 'Contexte' }],
      import_batch_id: 'lot-1',
    }),
    makeTrade({
      id: 't2',
      account_id: 'a1',
      instrument: 'NAS100',
      opened_at: '2026-10-06T14:00:00.000Z',
      gross_pnl: -80,
      fees: 2,
    }),
  ];
  const notes = [note('n1', '2026-10-05', 'Bonne discipline')];
  return { accounts, trades, notes };
}

/** Dépôt minimal en mémoire pour tester la restauration. */
function fakeRepo() {
  const accounts: Account[] = [];
  const trades: TradeInput[] = [];
  const notes: DailyNoteInput[] = [];
  const repo = {
    createAccount: async (input: AccountInput) => {
      const created: Account = { ...input, id: `new-${accounts.length + 1}`, created_at: '2026-10-09T00:00:00.000Z' };
      accounts.push(created);
      return created;
    },
    insertTrades: async (inputs: TradeInput[]) => {
      trades.push(...inputs);
      return inputs.length;
    },
    upsertDailyNote: async (input: DailyNoteInput) => {
      notes.push(input);
      return { id: `note-${notes.length}`, ...input };
    },
  };
  return { repo: repo as unknown as Repo, accounts, trades, notes };
}

describe('buildBackup', () => {
  it('retire les images et les lots d’import, et garde le reste', () => {
    const { accounts, trades, notes } = sampleData();
    const backup = buildBackup(accounts, trades, notes, new Date('2026-10-09T10:00:00.000Z'));
    expect(backup).toMatchObject({ app: BACKUP_APP, version: 1, exportedAt: '2026-10-09T10:00:00.000Z' });
    expect(backup.trades[0]).toMatchObject({ id: 't1', media: [], import_batch_id: null, net_pnl: 146 });
    expect(backup.accounts).toHaveLength(1);
    expect(backup.notes).toEqual(notes);
  });
});

describe('parseBackup', () => {
  it('relit une sauvegarde exportée à l’identique', () => {
    const { accounts, trades, notes } = sampleData();
    const text = JSON.stringify(buildBackup(accounts, trades, notes));
    const parsed = parseBackup(text);
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.trades.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(parsed.notes[0].review).toBe('Bonne discipline');
  });

  it('refuse un fichier qui n’est pas du JSON', () => {
    expect(() => parseBackup('pas du json')).toThrow('pas du JSON valide');
  });

  it('refuse un fichier d’une autre application', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'autre', version: 1, accounts: [], trades: [], notes: [] }))).toThrow(
      'pas une sauvegarde du journal',
    );
  });

  it('refuse une version inconnue', () => {
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, version: 9, accounts: [], trades: [], notes: [] }))).toThrow(
      'Version de sauvegarde non prise en charge',
    );
  });

  it('refuse une section manquante ou un trade incomplet', () => {
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1, accounts: [], trades: [] }))).toThrow('« notes »');
    const broken = { app: BACKUP_APP, version: 1, accounts: [], trades: [{ id: 'x' }], notes: [] };
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('trade n°1 incomplet');
  });
});

describe('planRestore', () => {
  it('reconnaît un compte par son nom, sans tenir compte de la casse', () => {
    const { accounts, trades, notes } = sampleData();
    const backup = parseBackup(JSON.stringify(buildBackup(accounts, trades, notes)));
    const existing = [makeAccount({ id: 'local-9', name: 'ftmo 100K ' })];
    const plan = planRestore(backup, existing, [], []);
    expect(plan.accounts[0]).toMatchObject({ backupId: 'a1', existingId: 'local-9' });
    expect(plan.trades).toHaveLength(2);
  });

  it('ignore les trades déjà présents et les notes déjà renseignées', () => {
    const { accounts, trades, notes } = sampleData();
    const backup = parseBackup(JSON.stringify(buildBackup(accounts, trades, notes)));
    const existingAccount = makeAccount({ id: 'a1', name: 'FTMO 100k' });
    const existingTrade = makeTrade({
      id: 'deja',
      account_id: 'a1',
      instrument: 'EURUSD',
      opened_at: '2026-10-05T08:00:00.000Z',
      gross_pnl: 150,
      fees: 4,
    });
    const plan = planRestore(backup, [existingAccount], [existingTrade], [note('x', '2026-10-05', 'Déjà là')]);
    expect(plan.trades.map((t) => t.input.instrument)).toEqual(['NAS100']);
    expect(plan.skippedTrades).toBe(1);
    expect(plan.notes).toEqual([]);
    expect(plan.skippedNotes).toBe(1);
  });

  it('écarte les trades dont le compte ne figure pas dans la sauvegarde', () => {
    const { accounts, trades, notes } = sampleData();
    const backup = buildBackup(accounts, [...trades, makeTrade({ id: 'orphelin', account_id: 'inconnu' })], notes);
    const plan = planRestore(backup, [], [], []);
    expect(plan.trades).toHaveLength(2);
    expect(plan.skippedTrades).toBe(1);
  });
});

describe('restoreBackup', () => {
  it('crée les comptes et les trades, puis une seconde restauration n’ajoute rien', async () => {
    const { accounts, trades, notes } = sampleData();
    const backup = parseBackup(JSON.stringify(buildBackup(accounts, trades, notes)));
    const target = fakeRepo();

    const first = await restoreBackup(target.repo, planRestore(backup, [], [], []));
    expect(first).toMatchObject({ accountsCreated: 1, accountsReused: 0, tradesAdded: 2, notesRestored: 1 });
    expect(target.accounts[0].name).toBe('FTMO 100k');
    expect(target.trades.every((t) => t.account_id === 'new-1')).toBe(true);
    expect(target.trades[0].import_batch_id).toBeNull();

    const existingTrades = target.trades.map((t, i) => makeTrade({ ...t, id: `copie-${i}`, account_id: 'new-1' }));
    const existingNotes = target.notes.map((n, i) => ({ ...n, id: `note-${i}` }));
    const second = await restoreBackup(
      target.repo,
      planRestore(backup, target.accounts, existingTrades, existingNotes),
    );
    expect(second).toMatchObject({ accountsCreated: 0, accountsReused: 1, tradesAdded: 0, tradesSkipped: 2, notesRestored: 0, notesSkipped: 1 });
    expect(target.trades).toHaveLength(2);
    expect(target.notes).toHaveLength(1);
  });
});
