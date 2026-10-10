import { motion, useReducedMotion } from 'motion/react';
import { cn, EASE } from './ui';

export type LogoSize = 'sm' | 'md' | 'lg';

const BOX: Record<LogoSize, string> = {
  sm: 'h-7 w-7 rounded-lg',
  md: 'h-9 w-9 rounded-xl',
  lg: 'h-14 w-14 rounded-2xl',
};
const ICON: Record<LogoSize, string> = { sm: 'h-4 w-4', md: 'h-[20px] w-[20px]', lg: 'h-8 w-8' };
const WORD: Record<LogoSize, string> = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' };

/**
 * Monogramme « S » de Seven, tracé d'un seul geste : deux courbes opposées, comme une écriture
 * manuscrite de journal. Tracé identique à public/favicon.svg — toute retouche doit être
 * reportée dans les deux. Le dessin remplit presque tout le cadre pour rester net à 16 px.
 */
const MONOGRAM =
  'M9.5 20.8 C9.5 23.3 12.1 24.6 16 24.6 C19.9 24.6 22.5 23.2 22.5 20.5 ' +
  'C22.5 17.7 19.9 16.4 16 15.6 C12.1 14.8 9.5 13.5 9.5 10.7 ' +
  'C9.5 8 12.1 6.6 16 6.6 C19.9 6.6 22.5 7.9 22.5 10.4';

interface LogoProps {
  size?: LogoSize;
  /** Une seule couleur (héritée du texte) : pour l'impression et les fonds neutres. */
  mono?: boolean;
  /** Trace le monogramme une seule fois au premier affichage (désactivé si « réduire les animations »). */
  animate?: boolean;
  className?: string;
}

/** Symbole seul. */
export function LogoMark({ size = 'md', mono = false, animate = false, className }: LogoProps) {
  const reduce = useReducedMotion();
  const draw = animate && !reduce;
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center',
        BOX[size],
        mono
          ? 'border-[1.5px] border-current text-current'
          : 'bg-accent text-accent-ink shadow-lg shadow-accent/25 ring-1 ring-accent-hi/40 ring-inset',
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        className={ICON[size]}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.9}
        strokeLinecap="round"
        aria-hidden
      >
        <motion.path
          d={MONOGRAM}
          initial={draw ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: EASE }}
        />
      </svg>
    </span>
  );
}

/**
 * Symbole et nom du site. Le nom est en serif : c'est la voix typographique de l'application
 * (titres de page, tiroirs, mois du journal), ce qui donne à la marque une identité propre.
 */
export function Logo({ size = 'md', mono = false, animate = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} mono={mono} animate={animate} />
      <span className={cn('font-serif leading-none tracking-tight', WORD[size], mono ? 'text-current' : 'text-fg')}>
        Seven Journal
      </span>
    </span>
  );
}
