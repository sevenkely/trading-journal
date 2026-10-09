import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepo } from './supabaseRepo';
import { tradeInput } from '../test/fixtures';

type Row = Record<string, unknown>;

/**
 * Faux client Supabase pour les suppressions et l’envoi d’un trade : filtres `eq` et `in`,
 * suppression, insertion et stockage (`storage.from().remove()`). Aucun appel réseau.
 */
function fakeSupabase(tables: Record<string, Row[]>, storageError: { message: string } | null = null) {
  const removed: string[][] = [];
  const from = (name: string) => {
    const filters: { column: string; values: unknown[] }[] = [];
    let mode: 'select' | 'delete' = 'select';
    const matches = (row: Row) => filters.every((f) => f.values.includes(row[f.column]));
    const api = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        filters.push({ column, values: [value] });
        return api;
      },
      in: (column: string, values: unknown[]) => {
        filters.push({ column, values });
        return api;
      },
      delete: () => {
        mode = 'delete';
        return api;
      },
      insert: (row: Row) => {
        tables[name] = [...(tables[name] ?? []), row];
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
      then: (resolve: (value: { data: unknown; error: null }) => void) => {
        const rows = tables[name] ?? [];
        if (mode === 'delete') {
          tables[name] = rows.filter((row) => !matches(row));
          resolve({ data: null, error: null });
        } else {
          resolve({ data: rows.filter(matches), error: null });
        }
      },
    };
    return api;
  };
  const storage = {
    from: () => ({
      remove: async (paths: string[]) => {
        removed.push(paths);
        return { data: paths, error: storageError };
      },
    }),
  };
  return { client: { from, storage } as unknown as SupabaseClient, removed, tables };
}

const trade = (id: string, screenshots: string[], extra: Row = {}): Row => ({ id, screenshots, ...extra });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('supabaseRepo : captures et stockage', () => {
  it('deleteTrades lit les chemins, supprime les lignes, puis supprime les fichiers', async () => {
    const { client, removed, tables } = fakeSupabase({
      trades: [trade('t1', ['u1/t1/a.webp', 'u1/t1/b.webp']), trade('t2', []), trade('t3', ['u1/t3/c.webp'])],
    });

    await createSupabaseRepo(client, 'u1').deleteTrades(['t1', 't2']);

    expect(tables.trades.map((row) => row.id)).toEqual(['t3']);
    expect(removed).toEqual([['u1/t1/a.webp', 'u1/t1/b.webp']]);
  });

  it('ne bloque pas la suppression quand le stockage refuse les fichiers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, tables } = fakeSupabase({ trades: [trade('t1', ['u1/t1/a.webp'])] }, { message: 'boom' });

    await expect(createSupabaseRepo(client, 'u1').deleteTrades(['t1'])).resolves.toBeUndefined();

    expect(tables.trades).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('deleteAccount supprime les fichiers des trades de ce compte seulement', async () => {
    const { client, removed, tables } = fakeSupabase({
      accounts: [{ id: 'a1' }, { id: 'a2' }],
      trades: [
        trade('t1', ['u1/t1/a.webp'], { account_id: 'a1' }),
        trade('t2', ['u1/t2/b.webp'], { account_id: 'a2' }),
      ],
    });

    await createSupabaseRepo(client, 'u1').deleteAccount('a1');

    expect(tables.accounts.map((row) => row.id)).toEqual(['a2']);
    expect(removed).toEqual([['u1/t1/a.webp']]);
  });

  it('deleteImportBatch supprime les fichiers des trades importés', async () => {
    const { client, removed, tables } = fakeSupabase({
      import_batches: [{ id: 'b1' }],
      trades: [
        trade('t1', ['u1/t1/a.webp'], { import_batch_id: 'b1' }),
        trade('t2', [], { import_batch_id: 'b2' }),
      ],
    });

    await createSupabaseRepo(client, 'u1').deleteImportBatch('b1');

    expect(tables.import_batches).toEqual([]);
    expect(removed).toEqual([['u1/t1/a.webp']]);
  });

  it('supprime tous les fichiers par lots, au-delà d’une page de 200 trades', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => trade(`t${i}`, [`u1/t${i}/a.webp`]));
    const { client, removed, tables } = fakeSupabase({ trades: rows });

    await createSupabaseRepo(client, 'u1').deleteTrades(rows.map((row) => String(row.id)));

    expect(tables.trades).toEqual([]);
    expect(removed.flat()).toHaveLength(250);
    expect(removed.length).toBeGreaterThan(1);
  });

  it('createTrade enregistre l’identifiant choisi et les chemins des captures', async () => {
    const { client, tables } = fakeSupabase({ trades: [] });
    const id = '6f1c2a9e-3b7d-4e8f-9a1b-2c3d4e5f6a7b';

    const created = await createSupabaseRepo(client, 'u1').createTrade(tradeInput(), {
      id,
      screenshots: [`u1/${id}/a.webp`],
    });

    expect(tables.trades[0]).toMatchObject({ id, user_id: 'u1', screenshots: [`u1/${id}/a.webp`] });
    expect(created.id).toBe(id);
    expect(created.screenshots).toEqual([`u1/${id}/a.webp`]);
  });

  it('createTrade sans capture laisse la base produire l’identifiant et enregistre une liste vide', async () => {
    const { client, tables } = fakeSupabase({ trades: [] });

    await createSupabaseRepo(client, 'u1').createTrade(tradeInput());

    expect(tables.trades[0]).not.toHaveProperty('id');
    expect(tables.trades[0]).toMatchObject({ screenshots: [], user_id: 'u1' });
  });
});
