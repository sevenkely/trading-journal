import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepo } from './supabaseRepo';

/**
 * Faux client Supabase : chaque requête renvoie la tranche demandée par `range()`,
 * comme PostgREST. Permet de tester la pagination et la normalisation sans réseau.
 */
function fakeSupabase(table: Record<string, unknown[]>): SupabaseClient {
  const from = (name: string) => {
    const rows = table[name] ?? [];
    let result = rows;
    const api = {
      select: () => api,
      eq: () => api,
      order: () => api,
      range: (start: number, end: number) => {
        result = rows.slice(start, end + 1);
        return api;
      },
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data: result, error: null }),
    };
    return api;
  };
  return { from } as unknown as SupabaseClient;
}

describe('supabaseRepo (client simulé)', () => {
  it('charge tous les trades par pages de 1 000', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({
      id: `t${i}`,
      gross_pnl: '10.00',
      fees: '0.50',
      net_pnl: '9.50',
      emotions_before: null,
      screenshots: null,
    }));
    const repo = createSupabaseRepo(fakeSupabase({ trades: rows }), 'user-1');
    const trades = await repo.listTrades();
    expect(trades).toHaveLength(2500);
    expect(trades[2499].id).toBe('t2499');
  });

  it('convertit les nombres renvoyés en chaîne et complète les tableaux vides', async () => {
    const repo = createSupabaseRepo(
      fakeSupabase({
        trades: [
          {
            id: 't1',
            gross_pnl: '12.50',
            fees: '0.5',
            net_pnl: '12.00',
            entry_price: '1.10250',
            exit_price: null,
            emotions_before: null,
            screenshots: null,
          },
        ],
      }),
      'user-1',
    );
    const [trade] = await repo.listTrades();
    expect(trade.gross_pnl).toBe(12.5);
    expect(trade.fees).toBe(0.5);
    expect(trade.net_pnl).toBe(12);
    expect(trade.entry_price).toBe(1.1025);
    expect(trade.exit_price).toBeNull();
    expect(trade.emotions_before).toEqual([]);
    expect(trade.media).toEqual([]);
    expect(trade.confluences).toEqual([]);
    expect(trade.thesis).toBeNull();
  });

  it('normalise les règles numériques des comptes', async () => {
    const repo = createSupabaseRepo(
      fakeSupabase({
        accounts: [
          {
            id: 'a1',
            name: 'Challenge',
            initial_balance: '100000.00',
            daily_loss_amount: null,
            daily_loss_pct: '5.000',
            max_loss_amount: null,
            max_loss_pct: '10.000',
            profit_target_amount: null,
            profit_target_pct: '10.000',
            min_trading_days: '4',
            consistency_pct: null,
          },
        ],
      }),
      'user-1',
    );
    const [account] = await repo.listAccounts();
    expect(account.initial_balance).toBe(100000);
    expect(account.daily_loss_pct).toBe(5);
    expect(account.daily_loss_amount).toBeNull();
    expect(account.min_trading_days).toBe(4);
  });
});
