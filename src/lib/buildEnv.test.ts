import { describe, expect, it } from 'vitest';
import { missingEnvMessage, missingSupabaseEnv, shouldRefuseDeploy } from './buildEnv';

describe('garde-fou de déploiement', () => {
  it('signale les variables absentes, vides ou faites d’espaces', () => {
    expect(missingSupabaseEnv({})).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
    expect(missingSupabaseEnv({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '  ' })).toEqual([
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
    ]);
    expect(missingSupabaseEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toEqual([
      'VITE_SUPABASE_ANON_KEY',
    ]);
    expect(
      missingSupabaseEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'cle' }),
    ).toEqual([]);
  });

  it('ne refuse jamais un build local ou en intégration continue', () => {
    expect(shouldRefuseDeploy({})).toBe(false);
    expect(shouldRefuseDeploy({ CI: 'true' })).toBe(false);
  });

  it('refuse un déploiement Vercel sans clés', () => {
    expect(shouldRefuseDeploy({ VERCEL: '1' })).toBe(true);
    expect(shouldRefuseDeploy({ VERCEL: '1', VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBe(true);
  });

  it('laisse passer un déploiement Vercel correctement configuré', () => {
    expect(
      shouldRefuseDeploy({
        VERCEL: '1',
        VITE_SUPABASE_URL: 'https://x.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'cle-publique',
      }),
    ).toBe(false);
  });

  it('laisse passer une démo volontaire', () => {
    expect(shouldRefuseDeploy({ VERCEL: '1', VITE_ALLOW_DEMO: '1' })).toBe(false);
    // Seule la valeur exacte « 1 » autorise la démo
    expect(shouldRefuseDeploy({ VERCEL: '1', VITE_ALLOW_DEMO: 'true' })).toBe(true);
  });

  it('nomme les variables et la sortie de secours dans le message', () => {
    const message = missingEnvMessage(['VITE_SUPABASE_ANON_KEY']);
    expect(message).toContain('VITE_SUPABASE_ANON_KEY');
    expect(message).toContain('Environment Variables');
    expect(message).toContain('VITE_ALLOW_DEMO=1');
  });
});
