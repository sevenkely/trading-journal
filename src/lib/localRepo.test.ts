// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalRepo } from './localRepo';
import { accountInput, tradeInput } from '../test/fixtures';

describe('localRepo (mode démo)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('crée un compte et un trade, puis calcule le P&L net', async () => {
    const repo = createLocalRepo();
    const account = await repo.createAccount(accountInput({ name: 'Démo' }));
    const trade = await repo.createTrade(tradeInput({ account_id: account.id, gross_pnl: 100, fees: 3 }));

    expect(trade.net_pnl).toBe(97);
    expect(await repo.listTrades()).toHaveLength(1);
    expect((await repo.listAccounts())[0].name).toBe('Démo');
  });

  it('met à jour un trade et recalcule le net', async () => {
    const repo = createLocalRepo();
    const account = await repo.createAccount(accountInput());
    const trade = await repo.createTrade(tradeInput({ account_id: account.id, gross_pnl: 100, fees: 0 }));
    const updated = await repo.updateTrade(trade.id, { gross_pnl: 80, fees: 5 });
    expect(updated.net_pnl).toBe(75);
    expect((await repo.listTrades())[0].net_pnl).toBe(75);
  });

  it('supprime un import avec ses trades, et un compte avec ses données', async () => {
    const repo = createLocalRepo();
    const account = await repo.createAccount(accountInput());
    const batch = await repo.createImportBatch({
      account_id: account.id,
      source: 'csv',
      filename: 'test.csv',
      rows_total: 2,
      rows_imported: 2,
      rows_skipped: 0,
    });
    await repo.insertTrades([
      tradeInput({ account_id: account.id, gross_pnl: 10, import_batch_id: batch.id }),
      tradeInput({ account_id: account.id, gross_pnl: -5, import_batch_id: batch.id }),
    ]);
    await repo.createTrade(tradeInput({ account_id: account.id, gross_pnl: 1 }));
    expect(await repo.listTrades()).toHaveLength(3);

    await repo.deleteImportBatch(batch.id);
    expect(await repo.listTrades()).toHaveLength(1);

    await repo.deleteAccount(account.id);
    expect(await repo.listTrades()).toHaveLength(0);
    expect(await repo.listAccounts()).toHaveLength(0);
  });

  it('enregistre une seule note par date', async () => {
    const repo = createLocalRepo();
    await repo.upsertDailyNote({ date: '2026-10-09', mood: 3, rating: null, plan: 'Attendre', review: null, lessons: null });
    await repo.upsertDailyNote({ date: '2026-10-09', mood: 4, rating: 5, plan: 'Attendre', review: 'Bien', lessons: null });
    const notes = await repo.listDailyNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].mood).toBe(4);
    expect(notes[0].review).toBe('Bien');
  });

  it('crée un profil par défaut avec la checklist', async () => {
    const repo = createLocalRepo();
    const profile = await repo.getProfile();
    expect(profile.default_timezone).toBe('Indian/Antananarivo');
    expect(profile.checklist.length).toBeGreaterThan(0);
    const updated = await repo.updateProfile({ default_currency: 'EUR' });
    expect(updated.default_currency).toBe('EUR');
  });
});
