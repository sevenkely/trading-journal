/**
 * Garde-fou de déploiement.
 *
 * Vite grave `VITE_SUPABASE_*` dans le bundle **au moment du build**. Sans ces variables, le
 * build réussit quand même et l'application se sert en mode démo : elle a l'air de fonctionner,
 * mais les trades d'un visiteur restent dans son navigateur. Un tel déploiement ne doit pas
 * passer inaperçu, donc sur Vercel on refuse le build avec un message qui dit quoi faire.
 *
 * En local et en intégration continue, le mode démo reste normal : la règle ne s'applique
 * qu'à l'hébergeur, et `VITE_ALLOW_DEMO=1` permet de publier une démo volontaire.
 */

export const SUPABASE_ENV_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;

export type BuildEnv = Record<string, string | undefined>;

/** Les variables Supabase absentes, vides, ou faites d'espaces. */
export function missingSupabaseEnv(env: BuildEnv): string[] {
  return SUPABASE_ENV_KEYS.filter((key) => !env[key]?.trim());
}

/** Faut-il refuser le build ? Seulement sur Vercel, et sauf démonstration assumée. */
export function shouldRefuseDeploy(env: BuildEnv): boolean {
  // `VERCEL` est posé par la plateforme pendant le build ; absent en local et sur GitHub Actions.
  if (!env.VERCEL) return false;
  if (env.VITE_ALLOW_DEMO === '1') return false;
  return missingSupabaseEnv(env).length > 0;
}

/** Message du build refusé : il nomme les variables et la sortie de secours. */
export function missingEnvMessage(missing: string[]): string {
  return [
    'Déploiement Vercel interrompu : la liaison Supabase n’est pas configurée.',
    '',
    `Variables manquantes : ${missing.join(', ')}.`,
    'Sans elles, l’application serait publiée en mode démo — les données d’un visiteur',
    'resteraient dans son navigateur, sans aucune synchronisation.',
    '',
    'À faire : Vercel → Settings → Environment Variables, ajouter les deux variables',
    'pour Production ET Preview, puis relancer un déploiement (un build existant ne',
    'reçoit jamais une variable ajoutée après coup).',
    '',
    'Pour publier volontairement une démonstration, définis VITE_ALLOW_DEMO=1.',
  ].join('\n');
}
