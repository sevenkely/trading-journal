import { useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE } from '../../lib/motion';

/** Teinte du tracé : « auto » suit le sens de la série (dernier point contre premier). */
export type SparkTone = 'auto' | 'gain' | 'loss' | 'accent' | 'muted';

export interface SparklineProps {
  values: readonly number[];
  tone?: SparkTone;
  className?: string;
  /** Épaisseur du trait en pixels écran : le tracé ne s'étire pas avec la largeur. */
  strokeWidth?: number;
  /** Remplissage dégradé sous la courbe. */
  fill?: boolean;
  /** Anime le tracé au montage. */
  animate?: boolean;
  /** Marque le dernier point : c'est lui qui porte le chiffre affiché à côté. */
  dot?: boolean;
}

const TONE_COLOR: Record<Exclude<SparkTone, 'auto'>, string> = {
  gain: 'var(--color-gain)',
  loss: 'var(--color-loss)',
  accent: 'var(--color-accent)',
  muted: 'var(--color-muted)',
};

interface Geometry {
  line: string;
  area: string;
  zero: number | null;
  /** Position du dernier point, en pourcentage de la boîte. */
  last: { x: number; y: number };
  tone: Exclude<SparkTone, 'auto'>;
}

/**
 * Micro-graphique de fond : un tracé d'aire qui accompagne un chiffre sans le concurrencer.
 * Dessiné à la main (pas de Recharts) : quelques dizaines de points, aucun axe, aucune interaction.
 * Le viewBox est étiré à la cellule ; `vector-effect` garde une épaisseur de trait constante,
 * et le point final est un élément HTML pour rester rond quelle que soit la boîte.
 */
export function Sparkline({
  values,
  tone = 'auto',
  className,
  strokeWidth = 1.5,
  fill = true,
  animate = true,
  dot = true,
}: SparklineProps) {
  const rawId = useId();
  const gradientId = `spark-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const reduce = useReducedMotion();

  const geometry = useMemo<Geometry | null>(() => {
    // Un point non fini (profit factor infini, moyenne sans donnée) est écarté du tracé.
    const points = values.filter((value) => Number.isFinite(value));
    if (points.length < 2) return null;

    const min = Math.min(...points);
    const max = Math.max(...points);
    // Série parfaitement plate : il n'y a rien à lire. Un trait horizontal ne ferait qu'ajouter du bruit.
    if (min === max) return null;

    const W = 100;
    const H = 100;
    const span = max - min;
    const step = W / (points.length - 1);
    const y = (value: number): number => H - ((value - min) / span) * H;

    const line = points
      .map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(2)},${y(value).toFixed(2)}`)
      .join(' ');

    const delta = points[points.length - 1] - points[0];
    const resolved: Exclude<SparkTone, 'auto'> =
      tone === 'auto' ? (delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'muted') : tone;

    return {
      line,
      area: `${line} L${W},${H} L0,${H} Z`,
      zero: min < 0 && max > 0 ? y(0) : null,
      last: { x: 100, y: y(points[points.length - 1]) },
      tone: resolved,
    };
  }, [values, tone]);

  if (!geometry) return null;

  const color = TONE_COLOR[geometry.tone];
  const draw = !reduce && animate;

  return (
    // Pas de `relative` ici : le positionnement appartient à l'appelant (les utilitaires Tailwind
    // gardent l'ordre de la feuille, pas celui de la classe — `relative` écraserait `absolute`).
    <span className={className} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.26} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {geometry.zero !== null && (
          <line
            x1={0}
            x2={100}
            y1={geometry.zero}
            y2={geometry.zero}
            stroke="var(--color-line-3)"
            strokeWidth={1}
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          />
        )}

        {fill && (
          <motion.path
            d={geometry.area}
            fill={`url(#${gradientId})`}
            initial={draw ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: draw ? 0.35 : 0 }}
          />
        )}

        <motion.path
          d={geometry.line}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={draw ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: EASE }}
        />
      </svg>

      {dot && (
        <motion.span
          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `clamp(3px, ${geometry.last.x}%, calc(100% - 3px))`,
            top: `${geometry.last.y}%`,
            backgroundColor: color,
            boxShadow: '0 0 0 2px var(--color-surface)',
          }}
          initial={draw ? { opacity: 0, scale: 0.3 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: EASE, delay: draw ? 0.85 : 0 }}
        />
      )}
    </span>
  );
}
