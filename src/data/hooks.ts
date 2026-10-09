import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import type { Repo } from '../lib/repo';

export function useRepo(): Repo {
  const { repo } = useAuth();
  if (!repo) throw new Error('Aucune session active');
  return repo;
}

export const queryKeys = {
  profile: ['profile'] as const,
  accounts: ['accounts'] as const,
  trades: ['trades'] as const,
  notes: ['notes'] as const,
  batches: ['batches'] as const,
};

export function useProfile() {
  const repo = useRepo();
  return useQuery({ queryKey: queryKeys.profile, queryFn: () => repo.getProfile() });
}

export function useAccounts() {
  const repo = useRepo();
  return useQuery({ queryKey: queryKeys.accounts, queryFn: () => repo.listAccounts() });
}

export function useTrades() {
  const repo = useRepo();
  return useQuery({ queryKey: queryKeys.trades, queryFn: () => repo.listTrades() });
}

export function useNotes() {
  const repo = useRepo();
  return useQuery({ queryKey: queryKeys.notes, queryFn: () => repo.listDailyNotes() });
}

export function useBatches() {
  const repo = useRepo();
  return useQuery({ queryKey: queryKeys.batches, queryFn: () => repo.listImportBatches() });
}

/** Recharge toutes les données après une modification (les vues restent cohérentes). */
export function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
