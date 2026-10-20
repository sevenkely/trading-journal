import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Circle, Flame } from 'lucide-react';
import type { Gauge } from '../lib/rules';
import { MOOD_LABELS } from '../lib/constants';
import { capFirst, formatDate, formatMoney, formatPercent } from '../lib/format';
import { Badge, Card, Eyebrow, PnlAmount, ProgressBar, SectionTitle, TickRail, cn, type RailTone } from './ui';
import { LEVEL_UI } from './RuleCard';

/** Même échelle de couleurs que les jauges de règles : vert dans les règles, orange puis rouge au-delà. */
const RAIL_TONES: Record<Gauge['level'], RailTone> = {
  ok: 'gain',
  warning: 'accent',
  danger: 'danger',
  breached: 'loss',
};

/**
 * Panneau du jour : ce qui se passe maintenant, pas depuis le début du compte.
 * C'est la vue qu'on ouvre pendant une séance, avant de prendre un trade.
 */
export function TodayPanel({
  day,
  tradesToday,
  pnlToday,
  floating,
  openCount,
  currency,
  daily,
  checklist,
  checklistDone,
  mood,
  plan,
  className,
}: {
  /** Jour de trading (AAAA-MM-JJ) dans le fuseau du périmètre affiché */
  day: string;
  tradesToday: number;
  pnlToday: number;
  floating: number;
  openCount: number;
  currency: string;
  /** Jauge de perte journalière la plus serrée des comptes affichés, ou null */
  daily: Gauge | null;
  checklist: string[];
  checklistDone: string[];
  mood: number | null;
  plan: string | null;
  className?: string;
}) {
  const remainingItems = checklist.filter((item) => !checklistDone.includes(item));
  const done = checklist.length - remainingItems.length;
  const dateLabel = formatDate(`${day}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' });
  const dailyUi = daily ? LEVEL_UI[daily.level] : null;

  return (
    <Card className={cn('p-5 md:p-6', className)}>
      <SectionTitle
        title="Aujourd’hui"
        description={capFirst(dateLabel)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {mood !== null && <Badge tone="accent">Humeur · {MOOD_LABELS[mood] ?? mood}</Badge>}
            <Link
              to={`/journal?date=${day}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-hi"
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              Ouvrir le journal
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
        <div className="bg-surface p-3.5">
          <Eyebrow>P&amp;L du jour</Eyebrow>
          <div className="figure mt-1.5 text-lg font-semibold">
            <PnlAmount value={pnlToday} currency={currency} />
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {tradesToday} trade{tradesToday > 1 ? 's' : ''} clôturé{tradesToday > 1 ? 's' : ''}
          </div>
        </div>

        <div className="bg-surface p-3.5">
          <Eyebrow>Flottant</Eyebrow>
          <div className="figure mt-1.5 text-lg font-semibold">
            {openCount === 0 ? <span className="text-muted">—</span> : <PnlAmount value={floating} currency={currency} />}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {openCount === 0 ? 'Aucune position ouverte' : `${openCount} position${openCount > 1 ? 's' : ''} ouverte${openCount > 1 ? 's' : ''}`}
          </div>
        </div>

        <div className="bg-surface p-3.5">
          <Eyebrow>{daily ? 'Marge avant limite du jour' : 'Limite journalière'}</Eyebrow>
          <div className={cn('figure mt-1.5 text-lg font-semibold', dailyUi && daily!.level !== 'ok' ? dailyUi.text : 'text-fg')}>
            {daily === null || daily.remaining === null ? (
              <span className="text-muted">—</span>
            ) : daily.remaining >= 0 ? (
              formatMoney(daily.remaining, currency)
            ) : (
              `dépassé de ${formatMoney(-daily.remaining, currency)}`
            )}
          </div>
          {daily ? (
            <TickRail
              className="mt-2.5"
              ratio={daily.ratio}
              ticks={8}
              majorEvery={4}
              height="sm"
              tone={RAIL_TONES[daily.level]}
              ariaLabel={`Limite de perte journalière : ${formatPercent(Math.min(100, daily.ratio * 100), 0)} consommé`}
            />
          ) : (
            <div className="mt-0.5 text-[11px] text-muted">Aucune règle de perte journalière</div>
          )}
        </div>

        <div className="bg-surface p-3.5">
          <Eyebrow>Checklist pré-trade</Eyebrow>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="figure text-lg font-semibold text-fg">
              {done}/{checklist.length}
            </span>
            {checklist.length > 0 && done === checklist.length && (
              <Badge tone="good">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                Prêt
              </Badge>
            )}
          </div>
          <ProgressBar ratio={checklist.length === 0 ? 0 : done / checklist.length} className="bg-accent" track="mt-2.5 w-full" />
        </div>
      </div>

      {checklist.length > 0 && remainingItems.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <Flame className="h-3.5 w-3.5 text-accent" aria-hidden />
            Encore à valider pour cette séance
          </div>
          <ul className="flex flex-wrap gap-2">
            {remainingItems.map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-surface-2/60 px-2.5 py-1 text-xs text-fg-2"
              >
                <Circle className="h-3 w-3 text-muted" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan && (
        <p className="mt-4 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5 text-xs leading-relaxed text-fg-2">
          <span className="font-medium text-fg">Plan du jour · </span>
          {plan}
        </p>
      )}

      {checklist.length === 0 && !plan && mood === null && (
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Personnalise ta checklist pré-trade et note ton humeur dans le journal : ce panneau suivra ta séance.
        </p>
      )}

      {daily !== null && daily.ratio >= 0.5 && (
        <p className={cn('mt-3 text-xs font-medium', dailyUi!.text)}>
          {formatPercent(Math.min(100, daily.ratio * 100), 0)} de la limite de perte journalière est engagé
          {openCount > 0 ? ' (positions ouvertes comprises)' : ''}.
        </p>
      )}
    </Card>
  );
}
