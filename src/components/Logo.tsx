import { motion, useReducedMotion } from 'motion/react';
import { cn, EASE } from './ui';

export type LogoSize = 'sm' | 'md' | 'lg';

const BOX: Record<LogoSize, string> = {
  sm: 'h-7 w-7 rounded-lg',
  md: 'h-9 w-9 rounded-xl',
  lg: 'h-14 w-14 rounded-2xl',
};
const ICON: Record<LogoSize, string> = { sm: 'h-4 w-4', md: 'h-[18px] w-[18px]', lg: 'h-7 w-7' };
const WORD: Record<LogoSize, string> = { sm: 'text-sm', md: 'text-[15px]', lg: 'text-xl' };

/** Courbe d’équité qui recule (drawdown) puis repart ; le point marque la clôture. Même tracé que public/favicon.svg. */
const CURVE = 'M7 22 L12.5 16.5 L16 19.5 L25 10';
const END = { x: 25, y: 10 };

interface LogoProps {
  size?: LogoSize;
  /** Une seule couleur (héritée du texte) : pour l’impression et les fonds neutres. */
  mono?: boolean;
  /** Trace la courbe une seule fois au premier affichage (désactivé si « réduire les animations »). */
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
        mono ? 'border-[1.5px] border-current text-current' : 'bg-accent text-accent-ink shadow-lg shadow-accent/25',
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        className={ICON[size]}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <motion.path
          d={CURVE}
          initial={draw ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: EASE }}
        />
        <motion.circle
          cx={END.x}
          cy={END.y}
          r={2.2}
          fill="currentColor"
          stroke="none"
          initial={draw ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.3 }}
        />
      </svg>
    </span>
  );
}

/** Symbole et nom du site. */
export function Logo({ size = 'md', mono = false, animate = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} mono={mono} animate={animate} />
      <span className={cn('font-semibold tracking-tight', WORD[size], mono ? 'text-current' : 'text-fg')}>
        Trading Journal
      </span>
    </span>
  );
}
