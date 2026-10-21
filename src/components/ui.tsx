import { Link } from 'react-router-dom';
import { formatMoney, pnlGlyph, signClass } from '../lib/format';
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { EASE } from '../lib/motion';
import { Sparkline, type SparkTone } from './charts/Sparkline';

/** Courbe de mouvement unique : rapide au départ, très douce à l’arrivée (définie dans lib/motion). */
export { EASE };

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const FIELD_BASE =
  'w-full rounded-xl border border-line-2 bg-surface-2/70 px-3.5 text-sm text-fg placeholder:text-muted/70 transition-[border-color,background-color,box-shadow] duration-200 ease-out-expo hover:border-muted/40 focus:border-accent/60 focus:bg-surface-2 focus:outline-none focus:ring-4 focus:ring-accent/10 disabled:opacity-50';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink shadow-lg shadow-accent/20 hover:bg-accent-hi',
  secondary: 'border border-line-2 bg-surface-2 text-fg hover:border-muted/40 hover:bg-surface-3',
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
  danger: 'border border-loss/30 bg-loss/10 text-loss hover:bg-loss/20',
};

/** Classes d’un bouton, utilisables aussi sur un lien (<Link>). */
export function buttonStyles(variant: ButtonVariant = 'secondary', size: 'sm' | 'md' = 'md', extra?: string): string {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out-expo active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
    size === 'sm' ? 'h-8 px-3 text-xs' : 'h-11 px-4 text-sm md:h-10',
    VARIANTS[variant],
    extra,
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button {...props} type={type} disabled={disabled || loading} className={buttonStyles(variant, size, className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(FIELD_BASE, 'h-11 md:h-10', className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative', className)}>
      <select {...props} className={cn(FIELD_BASE, 'h-11 appearance-none pr-10 md:h-10')}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(FIELD_BASE, 'min-h-24 py-2.5 leading-relaxed', className)} />;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-2', className)}>
      <span className="block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-card border border-line bg-surface p-5 shadow-card transition-[border-color,box-shadow,transform] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-line-2 hover:shadow-raised',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export type Tone = 'neutral' | 'good' | 'warn' | 'hot' | 'bad' | 'info' | 'accent';

const TONES: Record<Tone, string> = {
  neutral: 'border-line-2 bg-surface-3/60 text-fg-2',
  good: 'border-gain/25 bg-gain/10 text-gain',
  warn: 'border-accent/25 bg-accent/10 text-accent',
  hot: 'border-danger/25 bg-danger/10 text-danger',
  bad: 'border-loss/25 bg-loss/10 text-loss',
  info: 'border-info/25 bg-info/10 text-info',
  accent: 'border-accent/30 bg-accent/15 text-accent-hi',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Feuille de salle : la donnée se lit comme sur un relevé — un libellé en petites capitales,
 * une figure en monospace tabulaire alignée en colonne, une note discrète sous la figure.
 */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('eyebrow block', className)}>{children}</span>;
}

/**
 * Teinte d'un tracé de fond : elle suit le signe de la valeur affichée, jamais l'humeur de la courbe.
 * Un R moyen négatif reste rouge même si sa dernière valeur remonte.
 */
export function pnlTone(value: number | null | undefined): SparkTone {
  if (value == null || !Number.isFinite(value) || value === 0) return 'muted';
  return value > 0 ? 'gain' : 'loss';
}

/** Profit factor : au-dessus de 1 la stratégie gagne, en dessous elle perd. */
export function factorTone(value: number | null | undefined): SparkTone {
  if (value == null || !Number.isFinite(value)) return 'muted';
  return value >= 1 ? 'gain' : 'loss';
}

export type FigureTone = 'neutral' | 'gain' | 'loss' | 'accent' | 'muted';

const FIGURE_TONES: Record<FigureTone, string> = {
  neutral: 'text-fg',
  gain: 'text-gain',
  loss: 'text-loss',
  accent: 'text-accent-hi',
  muted: 'text-muted',
};

/**
 * Chiffre clé : ce que ça mesure, combien, et d'où ça vient.
 * `spark` dessine la tendance du chiffre derrière lui — la courbe de fond du relevé.
 */
export function Figure({
  label,
  value,
  sub,
  tone = 'neutral',
  size = 'md',
  className,
  spark,
  sparkTone = 'auto',
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: FigureTone;
  size?: 'md' | 'lg';
  className?: string;
  spark?: readonly number[];
  sparkTone?: SparkTone;
}) {
  return (
    <div className={cn('group relative isolate min-w-0 overflow-hidden px-4 pt-4 md:px-5', spark && spark.length > 1 ? 'pb-14' : 'pb-4', className)}>
      {spark && spark.length > 1 && (
        <Sparkline
          values={spark}
          tone={sparkTone}
          strokeWidth={1.35}
          className="pointer-events-none absolute inset-x-0 bottom-0 block h-12 opacity-60 transition-opacity duration-300 ease-out-expo [mask-image:linear-gradient(to_top,black_45%,transparent_92%)] group-hover:opacity-90"
        />
      )}
      <Eyebrow className="relative z-10 min-h-[1.2em] leading-snug">{label}</Eyebrow>
      <div
        className={cn(
          'figure relative z-10 mt-2 whitespace-nowrap font-semibold',
          size === 'lg' ? 'text-2xl md:text-[1.7rem]' : 'text-lg md:text-xl',
          FIGURE_TONES[tone],
        )}
      >
        {value}
      </div>
      {sub && <div className="relative z-10 mt-1.5 text-[11px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

/**
 * Panneau : une surface, un en-tête séparé par un filet, un corps. Remplace l'empilement
 * de cartes autonomes — le contenu se lit d'un seul tenant, l'en-tête garde son rôle.
 */
export function Panel({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  ariaLabel,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
}) {
  return (
    <section
      aria-label={title === undefined ? ariaLabel : undefined}
      className={cn('overflow-hidden rounded-card border border-line bg-surface shadow-card', className)}
    >
      {(eyebrow || title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && (
              <h2 className={cn('font-serif text-xl leading-tight text-fg', eyebrow ? 'mt-1' : undefined)}>{title}</h2>
            )}
            {description && <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-muted">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {/* `bodyClassName` remplace le rembourrage par défaut : pas de classes Tailwind en conflit à arbitrer. */}
      <div className={bodyClassName ?? 'px-5 py-4'}>{children}</div>
    </section>
  );
}

/** Ligne de relevé : libellé à gauche, figure à droite, séparée par un filet. */
export function LedgerRow({
  label,
  sub,
  value,
  href,
  className,
}: {
  label: ReactNode;
  sub?: ReactNode;
  value: ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <span className="min-w-0">
        <span className="block text-[13px] text-fg-2">{label}</span>
        {sub && <span className="mt-0.5 block truncate text-[11px] text-muted">{sub}</span>}
      </span>
      <span className="figure shrink-0 text-right text-sm text-fg">{value}</span>
    </>
  );
  if (href) {
    return (
      <Link
        to={href}
        className={cn(
          '-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-4',
          className,
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={cn('flex items-center justify-between gap-3 py-2.5', className)}>{body}</div>;
}

export type RailTone = 'accent' | 'gain' | 'loss' | 'danger' | 'info';

const RAIL_FILLS: Record<RailTone, string> = {
  accent: 'bg-accent',
  gain: 'bg-gain',
  loss: 'bg-loss',
  danger: 'bg-danger',
  info: 'bg-info',
};

/**
 * Réglette à crans : une échelle graduée, remplie à la valeur mesurée. La graduation est
 * l'information — un stop à 20 ticks, un plan respecté à 76 %, une marge de perte consommée.
 * Le chiffre exact est toujours écrit à côté : la couleur ne porte jamais l'information seule.
 */
export function TickRail({
  ratio,
  ticks = 12,
  majorEvery = 4,
  tone = 'accent',
  marker = null,
  height = 'md',
  label,
  ariaLabel,
  className,
}: {
  /** Part remplie, de 0 à 1 (bornée). */
  ratio: number;
  /** Nombre de graduations dessinées. */
  ticks?: number;
  /** Une graduation longue tous les N crans. */
  majorEvery?: number;
  tone?: RailTone;
  /** Repère vertical, de 0 à 1 (ex. la limite à ne pas dépasser). */
  marker?: number | null;
  height?: 'sm' | 'md';
  label?: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  const filled = clamp01(ratio);
  return (
    <div className={className}>
      <div
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
        className={cn(
          'relative overflow-hidden rounded-[4px] bg-surface-2/80 ring-1 ring-inset ring-line-2',
          height === 'sm' ? 'h-3' : 'h-5',
        )}
      >
        <span
          className={cn('absolute inset-y-0 left-0 transition-[width] duration-700 ease-out-expo', RAIL_FILLS[tone])}
          style={{ width: `${filled * 100}%` }}
        />
        <span className="absolute inset-0 flex items-end justify-between px-px">
          {Array.from({ length: ticks + 1 }, (_, i) => (
            <span
              key={i}
              className={cn('w-px bg-groove', i % majorEvery === 0 ? 'h-full' : 'h-1.5')}
            />
          ))}
        </span>
        {marker !== null && (
          <span
            className="absolute inset-y-0 w-[2px] bg-fg/80"
            style={{ left: `calc(${clamp01(marker) * 100}% - 1px)` }}
          />
        )}
      </div>
      {label && <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[11px] text-muted">{label}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-fg md:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Cellule de statistique ; à placer dans un StatStrip. */
/** Montant de P&L : couleur, symbole ▲/▼ (décoratif) et signe écrit. Aucune information ne repose sur la seule couleur. */
export function PnlAmount({
  value,
  currency,
  className,
}: {
  value: number | null | undefined;
  currency: string;
  className?: string;
}) {
  const glyph = pnlGlyph(value);
  return (
    <span className={cn('tabular-nums', signClass(value), className)}>
      {glyph && (
        <span aria-hidden className="mr-[0.35em] text-[0.7em]">
          {glyph}
        </span>
      )}
      {formatMoney(value, currency, true)}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  valueClass,
  spark,
  sparkTone = 'auto',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  valueClass?: string;
  /** Tendance du chiffre dessinée en fond de cellule (vert si la série monte, rouge si elle descend). */
  spark?: readonly number[];
  sparkTone?: SparkTone;
}) {
  return (
    <div
      className={cn(
        'group relative isolate min-w-0 overflow-hidden bg-surface px-5 pt-5 transition-colors duration-300 hover:bg-surface-2/50',
        spark && spark.length > 1 ? 'pb-14' : 'pb-5',
      )}
    >
      {spark && spark.length > 1 && (
        <Sparkline
          values={spark}
          tone={sparkTone}
          strokeWidth={1.35}
          className="pointer-events-none absolute inset-x-0 bottom-0 block h-12 opacity-60 transition-opacity duration-300 ease-out-expo [mask-image:linear-gradient(to_top,black_45%,transparent_92%)] group-hover:opacity-90"
        />
      )}
      <div className="relative z-10 text-[11px] font-medium uppercase leading-snug tracking-[0.13em] text-muted">{label}</div>
      <div
        className={cn(
          'figure relative z-10 mt-2 break-words text-xl font-semibold tracking-tight md:text-2xl',
          valueClass ?? 'text-fg',
        )}
      >
        {value}
      </div>
      {sub && <div className="relative z-10 mt-1.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Bandeau de statistiques : cellules séparées par de fins filets. */
export function StatStrip({
  children,
  className,
  columns = 4,
}: {
  children: ReactNode;
  className?: string;
  /** 3 colonnes pour six chiffres (deux rangées complètes), 4 par défaut */
  columns?: 3 | 4;
}) {
  return (
    <div
      className={cn(
        'stagger grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card',
        columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ProgressBar({
  ratio,
  className,
  track = 'w-full',
  delay = 0,
  pulse = false,
}: {
  ratio: number;
  className: string;
  track?: string;
  delay?: number;
  /** Pulsation lente de la barre (zone de danger) : opacité seule, coupée par « réduire les mouvements ». */
  pulse?: boolean;
}) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-surface-3', track)}>
      <motion.div
        className={cn('h-full w-full origin-left rounded-full', className, pulse && 'pulse-soft')}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: clamp01(ratio) }}
        transition={{ duration: 0.9, ease: EASE, delay }}
      />
    </div>
  );
}

/** Anneau de progression (0 à 1) qui se remplit à l’affichage. */
export function Ring({
  value,
  size = 120,
  stroke = 10,
  color = 'var(--color-gain)',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-3" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ stroke: color }}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: clamp01(value) }}
          transition={{ duration: 1.3, ease: EASE, delay: 0.2 }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-all duration-200 ease-out-expo active:scale-95',
        active
          ? 'border-accent/40 bg-accent/12 text-accent-hi'
          : 'border-line-2 bg-surface-2/60 text-muted hover:border-muted/40 hover:text-fg-2',
      )}
    >
      {children}
    </button>
  );
}

/** Sélecteur à pastille animée (glisse entre les options). */
export function Segmented<T extends string | number>({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-surface-2/70 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative h-8 shrink-0 rounded-lg px-3.5 text-xs font-medium transition-colors duration-200',
              active ? 'text-accent-ink' : 'text-muted hover:text-fg-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={`segmented-${id}`}
                className="absolute inset-0 rounded-lg bg-accent"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line-2 bg-surface/60 px-6 py-16 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-line-2 bg-surface-2 text-accent">
        {icon}
      </div>
      <h3 className="text-xl font-semibold tracking-tight text-fg">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Squelette de page pendant le chargement. */
export function Loading({ label }: { label?: string }) {
  return (
    <div role="status" aria-label={label ?? 'Chargement'} className="space-y-8 py-2">
      <div className="space-y-4">
        <div className="skeleton h-12 w-72 max-w-full" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
      </div>
      <div className="skeleton h-80" />
    </div>
  );
}

/** Nombre qui s’incrémente jusqu’à sa valeur (et s’anime à chaque changement). */
export function CountUp({
  value,
  format,
  duration = 1.1,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState<number>(() => (reduce ? value : 0));
  const current = useRef(0);

  useEffect(() => {
    if (reduce || !Number.isFinite(value)) {
      current.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(current.current, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => {
        current.current = v;
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return <span className={cn('tabular-nums', className)}>{format(display)}</span>;
}

/** Libellé du raccourci de recherche selon le système : ⌘K sur Mac, Ctrl K ailleurs. */
export const SEARCH_SHORTCUT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
