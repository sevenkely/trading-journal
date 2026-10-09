import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAccounts, useNotes, useProfile, useRefresh, useRepo, useTrades } from '../data/hooks';
import { dailyMap, sortByTradeTime, tradeTime } from '../lib/metrics';
import { dayKey, formatMoney, formatNumber, formatR, signClass } from '../lib/format';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, MOOD_LABELS } from '../lib/constants';
import type { DailyNote, Trade } from '../lib/types';
import { errorMessage, useToast } from '../components/Toast';
import { Badge, Button, Card, Chip, EASE, Field, Loading, PageHeader, SectionTitle, Textarea, cn, PnlAmount } from '../components/ui';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function hasContent(n: DailyNote | undefined): boolean {
  return Boolean(n && (n.mood || n.rating || n.plan || n.review || n.lessons));
}

/** Teinte d’une case : plus la journée a pesé, plus la couleur est franche. */
function heat(pnl: number, maxAbs: number): string | undefined {
  if (pnl === 0) return undefined;
  const mix = Math.round(8 + Math.min(1, Math.abs(pnl) / maxAbs) * 26);
  const color = pnl > 0 ? 'var(--color-gain)' : 'var(--color-loss)';
  return `color-mix(in oklab, ${color} ${mix}%, transparent)`;
}

/** Majuscule en tête seulement (les mois et les jours restent en minuscules en français). */
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Valeur compacte pour les petites cases du calendrier (mobile). */
function compactPnl(pnl: number): string {
  const sign = pnl > 0 ? '+' : pnl < 0 ? '-' : '';
  const abs = Math.abs(pnl);
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1).replace('.', ',')}k`;
  return `${sign}${Math.round(abs)}`;
}

export default function JournalPage() {
  const reduce = useReducedMotion();
  const { data: trades, isLoading: loadingTrades } = useTrades();
  const { data: notes, isLoading: loadingNotes } = useNotes();
  const { data: profile, isLoading: loadingProfile } = useProfile();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [picked, setPicked] = useState<string | null>(null);

  if (loadingTrades || loadingNotes || loadingProfile || loadingAccounts) return <Loading />;

  const tz = profile?.default_timezone ?? DEFAULT_TIMEZONE;
  const tradeList = trades ?? [];
  const accountCurrency = new Map((accounts ?? []).map((a) => [a.id, a.currency]));
  const currencyOf = (list: Trade[]): string => {
    const set = new Set(list.map((t) => accountCurrency.get(t.account_id) ?? DEFAULT_CURRENCY));
    return set.size === 1 ? [...set][0] : (profile?.default_currency ?? DEFAULT_CURRENCY);
  };

  const cells = dailyMap(tradeList, tz);
  const noteByDate = new Map((notes ?? []).map((n) => [n.date, n]));
  const todayKey = dayKey(new Date(), tz);
  const activeKey = picked ?? todayKey;

  const gridDays = eachDayOfInterval({
    start: startOfWeek(month, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const monthKeys = gridDays.filter((d) => isSameMonth(d, month)).map((d) => format(d, 'yyyy-MM-dd'));
  const monthTraded = monthKeys.filter((k) => cells.has(k));
  const monthPnl = monthTraded.reduce((sum, k) => sum + (cells.get(k)?.pnl ?? 0), 0);
  const greenDays = monthTraded.filter((k) => (cells.get(k)?.pnl ?? 0) > 0).length;
  const redDays = monthTraded.filter((k) => (cells.get(k)?.pnl ?? 0) < 0).length;
  const maxAbs = Math.max(1, ...monthKeys.map((k) => Math.abs(cells.get(k)?.pnl ?? 0)));
  const monthCurrency = currencyOf(tradeList.filter((t) => monthTraded.includes(dayKey(tradeTime(t), tz))));

  const dayTrades = sortByTradeTime(tradeList.filter((t) => dayKey(tradeTime(t), tz) === activeKey));
  const dayPnl = dayTrades.reduce((sum, t) => sum + t.net_pnl, 0);
  const dayCurrency = currencyOf(dayTrades);
  const dayDate = new Date(`${activeKey}T12:00:00`);

  return (
    <>
      <PageHeader
        title="Journal"
        description={`Calendrier des journées et notes de discipline. Les journées sont découpées selon le fuseau ${tz}.`}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="space-y-5 lg:sticky lg:top-6 lg:col-span-3 lg:self-start">
          <div className="flex items-center justify-between gap-3">
            <div className="font-serif text-4xl leading-none text-fg">{cap(format(month, 'MMMM yyyy', { locale: fr }))}</div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Mois précédent">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Mois suivant">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone={monthPnl > 0 ? 'good' : monthPnl < 0 ? 'bad' : 'neutral'}>
              P&amp;L du mois : {formatMoney(monthPnl, monthCurrency, true)}
            </Badge>
            <Badge>{monthTraded.length} jour(s) tradé(s)</Badge>
            <Badge tone="good">{greenDays} vert(s)</Badge>
            <Badge tone="bad">{redDays} rouge(s)</Badge>
          </div>

          <motion.div
            key={format(month, 'yyyy-MM')}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="grid grid-cols-7 gap-1.5 sm:gap-2"
          >
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-1 text-center text-xs text-muted">
                {w}
              </div>
            ))}
            {gridDays.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const cell = cells.get(key);
              const inMonth = isSameMonth(d, month);
              const isSelected = key === activeKey;
              const isToday = key === todayKey;
              const note = noteByDate.get(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPicked(key)}
                  aria-label={`${format(d, 'd MMMM', { locale: fr })}${cell ? `, P&L ${formatNumber(cell.pnl, 2)}` : ''}`}
                  aria-pressed={isSelected}
                  style={{ backgroundColor: cell ? heat(cell.pnl, maxAbs) : undefined }}
                  className={cn(
                    'relative flex min-h-14 flex-col justify-between rounded-xl border p-1.5 text-left transition-[transform,border-color,box-shadow] duration-200 ease-out-expo hover:-translate-y-px hover:border-line-2 active:scale-[0.97] sm:min-h-24 sm:p-2.5',
                    inMonth ? 'opacity-100' : 'opacity-30',
                    cell ? 'border-transparent' : 'border-line bg-surface-2/30',
                    isSelected && 'shadow-lg shadow-accent/10 ring-2 ring-accent',
                  )}
                >
                  <span className={cn('text-xs font-medium tabular-nums', isToday ? 'text-accent' : 'text-muted')}>
                    {format(d, 'd')}
                    {isToday && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" aria-hidden />}
                  </span>
                  {cell && (
                    <>
                      <span className={cn('text-[11px] font-semibold leading-none tabular-nums sm:hidden', signClass(cell.pnl))}>
                        {compactPnl(cell.pnl)}
                      </span>
                      <span className={cn('hidden text-sm font-semibold tabular-nums sm:block', signClass(cell.pnl))}>
                        {cell.pnl > 0 ? '+' : ''}
                        {formatNumber(cell.pnl, 0)}
                      </span>
                    </>
                  )}
                  {cell && <span className="hidden text-[11px] text-muted sm:block">{cell.count} trade(s)</span>}
                  {hasContent(note) && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-info" aria-hidden />}
                </button>
              );
            })}
          </motion.div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-gain/60" aria-hidden />
              Journée gagnante
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-loss/60" aria-hidden />
              Journée perdante
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-info" aria-hidden />
              Notes rédigées
            </span>
          </div>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-5">
            <div>
              <div className="text-[13px] text-muted">Journée sélectionnée</div>
              <div className="mt-1 text-lg font-semibold tracking-tight text-fg">
                {cap(format(dayDate, 'EEEE d MMMM yyyy', { locale: fr }))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
              <div className="bg-surface-2/60 p-3.5">
                <div className="text-xs text-muted">P&amp;L net</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {dayTrades.length ? <PnlAmount value={dayPnl} currency={dayCurrency} /> : <span className="text-muted">—</span>}
                </div>
              </div>
              <div className="bg-surface-2/60 p-3.5">
                <div className="text-xs text-muted">Trades</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{dayTrades.length}</div>
              </div>
            </div>
            {dayTrades.length === 0 ? (
              <p className="text-sm text-muted">Aucun trade ce jour-là.</p>
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {dayTrades.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/trades/${t.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-fg">{t.instrument}</span>
                        <span className="text-muted"> · {t.direction === 'long' ? 'achat' : 'vente'}</span>
                        {t.risk_amount ? <span className="text-muted"> · {formatR(t.net_pnl / t.risk_amount)}</span> : null}
                      </span>
                      <PnlAmount value={t.net_pnl} currency={accountCurrency.get(t.account_id) ?? DEFAULT_CURRENCY} className="shrink-0 font-semibold" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <DayNoteEditor key={activeKey} date={activeKey} note={noteByDate.get(activeKey)} />
        </div>
      </div>
    </>
  );
}

function DayNoteEditor({ date, note }: { date: string; note: DailyNote | undefined }) {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const [mood, setMood] = useState<number | null>(note?.mood ?? null);
  const [rating, setRating] = useState<number | null>(note?.rating ?? null);
  const [plan, setPlan] = useState(note?.plan ?? '');
  const [review, setReview] = useState(note?.review ?? '');
  const [lessons, setLessons] = useState(note?.lessons ?? '');

  const save = useMutation({
    mutationFn: () =>
      repo.upsertDailyNote({
        date,
        mood,
        rating,
        plan: plan.trim() || null,
        review: review.trim() || null,
        lessons: lessons.trim() || null,
      }),
    onSuccess: async () => {
      await refresh();
      toast.show('Journal enregistré');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  return (
    <Card className="space-y-6">
      <SectionTitle title="Notes du jour" description="Ton état d’esprit, ton plan et ce que tu retiens." />

      <Field label="Humeur">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((v) => (
            <Chip key={v} active={mood === v} onClick={() => setMood(mood === v ? null : v)}>
              {MOOD_LABELS[v]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Discipline du jour" hint="1 = très indiscipliné, 5 = plan suivi à la lettre.">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((v) => (
            <Chip key={v} active={rating === v} onClick={() => setRating(rating === v ? null : v)}>
              {v}/5
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Plan de la journée">
        <Textarea
          rows={3}
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          placeholder="Biais, niveaux clés, nombre max de trades, limite de perte…"
        />
      </Field>

      <Field label="Bilan">
        <Textarea
          rows={3}
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Ce qui s’est passé, ce que tu as bien ou mal fait…"
        />
      </Field>

      <Field label="Leçons">
        <Textarea rows={2} value={lessons} onChange={(e) => setLessons(e.target.value)} placeholder="Une chose à retenir pour demain" />
      </Field>

      <div className="flex justify-end">
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Enregistrer les notes
        </Button>
      </div>
    </Card>
  );
}
