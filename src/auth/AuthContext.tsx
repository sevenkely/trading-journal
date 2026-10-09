import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { createSupabaseRepo } from '../lib/supabaseRepo';
import { createLocalRepo } from '../lib/localRepo';
import type { Repo } from '../lib/repo';

export interface AuthValue {
  /** supabase = compte réel ; local = mode démo sans serveur */
  mode: 'supabase' | 'local';
  loading: boolean;
  userId: string | null;
  email: string | null;
  repo: Repo | null;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const localRepo = createLocalRepo();

const LOCAL_VALUE: AuthValue = {
  mode: 'local',
  loading: false,
  userId: 'local',
  email: null,
  repo: localRepo,
  signInWithEmail: async () => {},
  signOut: async () => {},
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Évite qu'un autre utilisateur du même navigateur voie les données en cache
      if (event === 'SIGNED_OUT') queryClient.clear();
      setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthValue>(() => {
    if (!supabase) return LOCAL_VALUE;
    const client = supabase;
    const user = session?.user ?? null;
    return {
      mode: 'supabase',
      loading,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      repo: user ? createSupabaseRepo(client, user.id) : null,
      signInWithEmail: async (email: string) => {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
      },
      signOut: async () => {
        await client.auth.signOut();
      },
    };
  }, [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé à l’intérieur d’AuthProvider');
  return value;
}
