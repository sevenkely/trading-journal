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

  it('enregistre le dossier d’un trade : setup, thèse, images et verdict', async () => {
    const repo = createLocalRepo();
    const account = await repo.createAccount(accountInput());
    const setup = await repo.createSetup({
      name: '  Sweep  de liquidité ',
      description: null,
      htf: 'H4 baissier',
      invalidation: 'Clôture au-dessus',
      checklist: [],
    });
    expect(setup.name).toBe('Sweep de liquidité');

    const trade = await repo.createTrade(
      tradeInput({
        account_id: account.id,
        setup_id: setup.id,
        setup: setup.name,
        thesis: 'Sweep du low de Londres',
        invalidation: 'Clôture H1 au-dessus',
        verdict: 'played_out',
        confluences: ['Biais HTF aligné'],
        media: [{ path: 'demo/a.webp', role: 'htf', caption: 'Contexte H4' }],
      }),
    );

    const [stored] = await repo.listTrades();
    expect(stored.thesis).toBe('Sweep du low de Londres');
    expect(stored.verdict).toBe('played_out');
    expect(stored.confluences).toEqual(['Biais HTF aligné']);
    expect(stored.media).toEqual([{ path: 'demo/a.webp', role: 'htf', caption: 'Contexte H4' }]);
    expect(stored.setup_id).toBe(setup.id);

    await repo.updateTrade(trade.id, { media: [{ path: 'demo/b.webp', role: 'ltf', caption: null }] });
    expect((await repo.listTrades())[0].media).toHaveLength(1);
    expect((await repo.listTrades())[0].media[0].role).toBe('ltf');
  });

  it('retire un setup de la bibliothèque sans effacer le libellé des trades', async () => {
    const repo = createLocalRepo();
    const account = await repo.createAccount(accountInput());
    const setup = await repo.createSetup({
      name: 'ORB',
      description: null,
      htf: null,
      invalidation: null,
      checklist: [],
    });
    await repo.createTrade(tradeInput({ account_id: account.id, setup_id: setup.id, setup: 'ORB' }));

    await repo.deleteSetup(setup.id);

    const [stored] = await repo.listTrades();
    expect(stored.setup_id).toBeNull();
    expect(stored.setup).toBe('ORB');
    expect(await repo.listSetups()).toEqual([]);
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

  it('ne renvoie que les trades les plus récents quand une limite est demandée', async () => {
    const repo = createLocalRepo();
    const account = await repo.createAccount(accountInput());
    await repo.insertTrades([
      tradeInput({ account_id: account.id, instrument: 'VIEUX', opened_at: '2026-09-01T08:00:00.000Z' }),
      tradeInput({ account_id: account.id, instrument: 'RECENT', opened_at: '2026-10-05T08:00:00.000Z' }),
      tradeInput({ account_id: account.id, instrument: 'PLUS RECENT', opened_at: '2026-10-06T08:00:00.000Z' }),
    ]);

    expect(await repo.listTrades()).toHaveLength(3);
    const limited = await repo.listTrades({ limit: 2 });
    expect(limited.map((t) => t.instrument).sort()).toEqual(['PLUS RECENT', 'RECENT']);
    expect(await repo.listTrades({ limit: 10 })).toHaveLength(3);
  });
});
