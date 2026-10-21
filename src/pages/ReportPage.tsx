import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, Cell, CartesianGrid, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePalette } from '../components/PaletteContext';
import { LOSS_HATCH, axisTick, chartPalette } from '../components/charts/shared';
import { CheckCircle2, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useAccounts, useProfile, useTrades } from '../data/hooks';
import { detectBehavior, MAX_TRADES_PER_DAY, REVENGE_WINDOW_MINUTES } from '../lib/behavior';
import { shortDate } from '../lib/chartData';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from '../lib/constants';
import { forecastTarget, type Forecast } from '../lib/forecast';
import { capFirst, dayKey, formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, formatProfitFactor, formatSignedCompact } from '../lib/format';
import { computeStats, sortByTradeTime, splitTrades, tradeTime, type Stats } from '../lib/metrics';
import { statSparks } from '../lib/spark';
import { rMultiple } from '../lib/tradeQuery';
import { lastMonths, mondayOf, monthBounds, monthDays, monthWeeks, shiftDays, shiftMonthKey, weekKeys } from '../lib/patterns';
import { round2 } from '../lib/utils';
import type { Account, Trade } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  Loading,
  PageHeader,
  SectionTitle,
  Segmented,
  Stat,
  StatStrip,
  cn,
  factorTone,
  pnlTone,
  PnlAmount,
  type Tone,
} from '../components/ui';
import { Logo } from '../components/Logo';

type ReportPeriod = 'semaine' | 'mois' | '12m';

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'semaine', label: 'Semaine' },
  { value: 'mois', label: 'Mois' },
  { value: '12m', label: '12 mois' },
];

/** Fenêtre du bilan annuel : douze mois glissants. */
const YEAR_MONTHS = 12;

interface TableRow {
  /** Identifiant stable du groupe (premier jour). */
  key: string;
  label: string;
  days: string[];
  list: Trade[];
  stats: Stats;
  overtrading: number;
  revenge: number;
}

interface DayRow {
  key: string;
  list: Trade[];
  pnl: number;
  winRate: number | null;
}

interface Range {
  /** Tous les jours affichés, dans l’ordre, sans trou. */
  days: string[];
  /** Découpage du tableau : un jour en semaine, une semaine civile en mois, un mois sur douze mois. */
  groups: { key: string; label: string; days: string[] }[];
  description: string;
  previousDays: string[];
  previousLabel: string;
  /** Ligne « volume » de la bande de chiffres : jours tradés, ou mois tradés sur douze mois. */
  countLabel: string;
  countSub: string;
  rowTitle: string;
  rowHead: string;
  chartTitle: string;
  chartNote: string;
  emptyText: string;
  /** Libellés du meilleur et du pire : un jour, ou un mois. */
  extremeLabel: { best: string; worst: string };
}

/** Libellé d’une date YYYY-MM-DD, lu en UTC pour ne jamais décaler le jour. */
function dayText(key: string, options: Intl.DateTimeFormatOptions): string {
  return formatDate(`${key}T12:00:00Z`, { ...options, timeZone: 'UTC' });
}

/** Comme dayText, mais le 1er du mois s’écrit « 1er » et non « 1 ». */
function dateText(key: string, options: Intl.DateTimeFormatOptions): string {
  const text = dayText(key, options);
  return key.endsWith('-01') ? text.replace(/^1(\s)/, '1er$1') : text;
}

/** Étiquette d’une ligne du tableau : le jour en mode semaine, la semaine civile en mode mois. */
function groupLabel(period: ReportPeriod, days: string[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (period === 'semaine') return capFirst(dayText(first, { weekday: 'long', day: 'numeric', month: 'short' }));
  return `Semaine du ${dayText(first, { day: 'numeric', month: 'short' })} au ${dayText(last, { day: 'numeric', month: 'short' })}`;
}

/** Nom d’un mois YYYY-MM : « Août 2025 ». */
function monthText(monthKey: string): string {
  return capFirst(dateText(`${monthKey}-01`, { month: 'long', year: 'numeric' }));
}

/** Mois abrégé pour l’axe du bilan annuel : « août ». Sur douze mois, chaque nom n’apparaît qu’une fois. */
function shortMonth(monthKey: string): string {
  return dayText(`${monthKey}-01`, { month: 'short' });
}

/**
 * Bornes et découpage de la période affichée. La semaine va du lundi au dimanche (fuseau du profil) ;
 * le mois suit le calendrier et se découpe en semaines civiles, tronquées aux bords du mois.
 * La période en cours s’arrête à aujourd’hui : les jours à venir ne comptent pas comme « sans trade ».
 */
function buildRange(period: ReportPeriod, offset: number, now: Date, tz: string): Range {
  if (period === 'semaine') {
    const week = weekKeys(mondayOf(now, tz, offset));
    return {
      days: week,
      groups: week.map((key) => ({ key, label: groupLabel('semaine', [key]), days: [key] })),
      description: `Du ${dateText(week[0], { day: 'numeric', month: 'long' })} au ${dateText(week[6], { day: 'numeric', month: 'long', year: 'numeric' })}.`,
      previousDays: weekKeys(shiftDays(week[0], -7)),
      previousLabel: 'Semaine préc.',
      countLabel: 'Jours tradés',
      countSub: 'Du lundi au dimanche',
      rowTitle: 'Jour par jour',
      rowHead: 'Jour',
      chartTitle: 'P&L par jour',
      chartNote: 'Gains en vert, pertes en rouge. Chaque compte découpe ses journées selon son fuseau.',
      emptyText: 'cette semaine',
      extremeLabel: { best: 'Meilleur jour', worst: 'Pire jour' },
    };
  }

  if (period === '12m') {
    const endMonth = shiftMonthKey(dayKey(now, tz).slice(0, 7), -offset);
    const months = lastMonths(endMonth, YEAR_MONTHS);
    return {
      days: months.flatMap((month) => monthDays(month)),
      groups: months.map((month) => ({ key: month, label: monthText(month), days: monthDays(month) })),
      description: `De ${dateText(`${months[0]}-01`, { month: 'long', year: 'numeric' })} à ${dateText(`${months[months.length - 1]}-01`, { month: 'long', year: 'numeric' })}. Le mois en cours n’est compté que jusqu’à aujourd’hui.`,
      // Fenêtre précédente : les douze mois juste avant, pour la comparaison
      previousDays: lastMonths(shiftMonthKey(months[0], -1), YEAR_MONTHS).flatMap((month) => monthDays(month)),
      previousLabel: '12 mois préc.',
      countLabel: 'Mois tradés',
      countSub: 'Sur les douze derniers mois',
      rowTitle: 'Mois par mois',
      rowHead: 'Mois',
      chartTitle: 'P&L par mois',
      chartNote: 'Une barre par mois ; la ligne suit le cumul sur douze mois. Le mois en cours s’arrête à aujourd’hui.',
      emptyText: 'ces douze derniers mois',
      extremeLabel: { best: 'Meilleur mois', worst: 'Pire mois' },
    };
  }

  const monthKey = shiftMonthKey(dayKey(now, tz).slice(0, 7), -offset);
  const { first, last } = monthBounds(monthKey);
  const today = dayKey(now, tz);
  const month = monthDays(monthKey);
  const days = offset === 0 ? month.filter((day) => day <= today) : month;
  const shown = new Set(days);
  const groups = monthWeeks(monthKey)
    .map((week) => week.filter((day) => shown.has(day)))
    .filter((week) => week.length > 0)
    .map((week) => ({ key: week[0], label: groupLabel('mois', week), days: week }));

  return {
    days,
    groups,
    description:
      offset === 0
        ? `Mois en cours, du ${dateText(first, { day: 'numeric', month: 'long' })} au ${dateText(days[days.length - 1], { day: 'numeric', month: 'long', year: 'numeric' })}.`
        : `Du ${dateText(first, { day: 'numeric', month: 'long' })} au ${dateText(last, { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    previousDays: monthDays(shiftMonthKey(monthKey, -1)),
    previousLabel: 'Mois préc.',
    countLabel: 'Jours tradés',
    countSub: offset === 0 ? 'Depuis le 1er du mois' : 'Sur tout le mois',
    rowTitle: 'Semaine par semaine',
    rowHead: 'Semaine',
    chartTitle: 'P&L par jour',
    chartNote: 'Le mois jour par jour ; les jours sans trade restent à zéro. Chaque compte découpe ses journées selon son fuseau.',
    emptyText: 'ce mois-ci',
    extremeLabel: { best: 'Meilleur jour', worst: 'Pire jour' },
  };
}

const sumNet = (list: Trade[]) => list.reduce((sum, t) => sum + t.net_pnl, 0);

function DaySignals({ count, revenge, overtrading }: { count: number; revenge: number; overtrading: number }) {
  return (
    <>
      {revenge > 0 && <Badge tone="bad">Revanche ×{revenge}</Badge>}
      {overtrading > 0 && <Badge tone="warn">Surtrading ×{overtrading}</Badge>}
      {count === 0 && <span className="text-xs text-muted">Pas de trade</span>}
    </>
  );
}

const FORECAST_BADGE: Record<Exclude<Forecast['status'], 'no-target'>, { label: string; tone: Tone }> = {
  reached: { label: 'Atteint', tone: 'good' },
  estimate: { label: 'Estimation', tone: 'info' },
  negative: { label: 'Rythme négatif', tone: 'bad' },
  'no-data': { label: 'Pas de données', tone: 'neutral' },
};

function ForecastRow({ account, forecast }: { account: Account; forecast: Forecast }) {
  const cur = account.currency;
  const remaining = formatMoney(Math.max(forecast.remaining ?? 0, 0), cur);
  const average = formatMoney(forecast.avgDailyPnl ?? 0, cur, true);
  let text = '';
  if (forecast.status === 'reached') {
    text = 'Le P&L réalisé dépasse l’objectif de profit.';
  } else if (forecast.status === 'estimate' && forecast.date) {
    const when = dayText(forecast.date, { day: 'numeric', month: 'long', year: 'numeric' });
    text = `Il reste ${remaining}. Au rythme moyen de ${average} par jour de trading (${forecast.lookbackDays} derniers jours), l’objectif serait atteint dans environ ${forecast.tradingDays} jour(s) de trading, vers le ${when}.`;
  } else if (forecast.status === 'negative') {
    text = `Il reste ${remaining}, mais le rythme récent est négatif (${average} par jour de trading). Pas d’estimation tant qu’il ne repart pas.`;
  } else if (forecast.status === 'no-data') {
    text = `Il reste ${remaining}. Aucun trade sur les ${forecast.lookbackDays} derniers jours : pas d’estimation.`;
  }
  const badge = forecast.status === 'no-target' ? null : FORECAST_BADGE[forecast.status];

  return (
    <li className="space-y-2 rounded-xl border border-line-2 bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-fg">{account.name}</span>
        {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
      </div>
      <p className="text-sm leading-relaxed text-fg-2">{text}</p>
    </li>
  );
}

function SignalItem({ trade, currency, note }: { trade: Trade; currency: string; note: string }) {
  return (
    <li>
      <Link
        to={`/trades/${trade.id}`}
        className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-fg">
            {trade.instrument} · {formatDateTime(trade.opened_at)}
          </span>
          <span className="block truncate text-xs text-muted">{note}</span>
        </span>
        <PnlAmount value={trade.net_pnl} currency={currency} className="shrink-0 text-sm font-semibold" />
      </Link>
    </li>
  );
}

/** Étiquette de valeur au-dessus (gain) ou au-dessous (perte) de chaque barre : la couleur n’est pas seule à porter le signe. */
function renderValueLabel(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const value = Number(props.value ?? 0);
  if (!Number.isFinite(value) || value === 0) return null;
  // Le haut et le bas de la barre, quel que soit le signe de la hauteur renvoyée
  const top = Math.min(y, y + height);
  const bottom = Math.max(y, y + height);
  return (
    <text x={x + width / 2} y={value > 0 ? top - 6 : bottom + 13} textAnchor="middle" fontSize={11} fill={chartPalette().text}>
      {formatSignedCompact(value)}
    </text>
  );
}

export default function ReportPage() {
  const { gainRgb, lossRgb } = usePalette();
  const [searchParams] = useSearchParams();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: trades, isLoading: loadingTrades } = useTrades();
  const { data: profile, isLoading: loadingProfile } = useProfile();
  const [period, setPeriod] = useState<ReportPeriod>(() => {
    const requested = searchParams.get('periode');
    return requested === 'mois' || requested === '12m' ? requested : 'semaine';
  });
  const [offset, setOffset] = useState(0);
  const [now] = useState(() => new Date());

  if (loadingAccounts || loadingTrades || loadingProfile) return <Loading />;

  const palette = chartPalette();
  const axis = axisTick();
  const tz = profile?.default_timezone ?? DEFAULT_TIMEZONE;
  const defaultCurrency = profile?.default_currency ?? DEFAULT_CURRENCY;
  const accountList = accounts ?? [];
  const accountById = new Map(accountList.map((a) => [a.id, a]));
  // Chaque compte découpe ses journées selon son propre fuseau
  const tzOf = (accountId: string) => accountById.get(accountId)?.day_timezone || tz;
  const currencyOf = (t: Trade) => accountById.get(t.account_id)?.currency ?? defaultCurrency;
  const dayOf = (t: Trade) => dayKey(tradeTime(t), tzOf(t.account_id));
  const allTrades = trades ?? [];

  const range = buildRange(period, offset, now, tz);
  const inPeriod = new Set(range.days);
  const previousDays = new Set(range.previousDays);
  const periodTrades = sortByTradeTime(allTrades.filter((t) => inPeriod.has(dayOf(t))));
  const previousPnl = sumNet(allTrades.filter((t) => previousDays.has(dayOf(t))));
  const currencies = [...new Set(periodTrades.map(currencyOf))];
  const currency = currencies.length === 1 ? currencies[0] : defaultCurrency;

  // Un seul parcours des trades de la période : chaque ligne et chaque jour s’y servent ensuite
  const byDay = new Map<string, Trade[]>();
  for (const t of periodTrades) {
    const key = dayOf(t);
    const list = byDay.get(key);
    if (list) list.push(t);
    else byDay.set(key, [t]);
  }

  // Revanche : lue sur toute la chronologie, pour qu’une perte de la veille compte aussi
  const behavior = detectBehavior(allTrades, tzOf);
  const revenge = sortByTradeTime(behavior.revenge.filter((t) => inPeriod.has(dayOf(t))));
  const overtrading = sortByTradeTime(behavior.overtrading.filter((t) => inPeriod.has(dayOf(t))));
  const revengeIds = new Set(revenge.map((t) => t.id));
  const overtradingIds = new Set(overtrading.map((t) => t.id));

  const stats = computeStats(periodTrades);
  // Le chiffre affiché est réalisé : le tracé de fond doit l'être aussi, sinon une position
  // ouverte ferait monter la courbe sous un P&L net qui ne la compte pas.
  const realizedPeriod = splitTrades(periodTrades).realized;
  const sparks = statSparks(
    realizedPeriod.map((trade) => trade.net_pnl),
    realizedPeriod.map((trade) => rMultiple(trade)),
  );

  // Un point par jour : sert au graphique, au meilleur / pire jour et au nombre de jours tradés.
  // Sur douze mois, l’échelle utile est le mois : les points quotidiens ne sont pas calculés.
  const dayRows: DayRow[] =
    period === '12m'
      ? []
      : range.days.map((key) => {
          const list = byDay.get(key) ?? [];
          const dayStats = computeStats(list);
          return { key, list, pnl: dayStats.netPnl, winRate: list.length === 0 ? null : dayStats.winRate };
        });
  const traded = dayRows.filter((d) => d.list.length > 0);

  // Une ligne par groupe : le jour en mode semaine, la semaine civile en mode mois, le mois sur douze mois
  const tableRows: TableRow[] = range.groups.map((group) => {
    const list = group.days.flatMap((day) => byDay.get(day) ?? []);
    return {
      key: group.key,
      label: group.label,
      days: group.days,
      list,
      stats: computeStats(list),
      overtrading: list.filter((t) => overtradingIds.has(t.id)).length,
      revenge: list.filter((t) => revengeIds.has(t.id)).length,
    };
  });

  // Meilleur et pire : un jour en semaine / mois, un mois sur douze mois — même calcul, autre maille
  const extremes =
    period === '12m'
      ? tableRows
          .filter((row) => row.list.length > 0)
          .map((row) => ({ key: row.key, label: row.label, pnl: row.stats.netPnl }))
      : traded.map((day) => ({
          key: day.key,
          label: capFirst(dayText(day.key, { weekday: 'long', day: 'numeric' })),
          pnl: day.pnl,
        }));
  const best = extremes.length > 0 ? extremes.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null;
  const worst = extremes.length > 0 ? extremes.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null;
  const tradedCount = period === '12m' ? extremes.length : traded.length;
  const countTotal = period === '12m' ? YEAR_MONTHS : range.days.length;

  const forecasts = accountList
    .filter((a) => a.status !== 'archived')
    .map((account) => ({
      account,
      forecast: forecastTarget(account, allTrades.filter((t) => t.account_id === account.id), now, tzOf(account.id)),
    }));
  const withTarget = forecasts.filter((f) => f.forecast.status !== 'no-target');
  const withoutTarget = forecasts.filter((f) => f.forecast.status === 'no-target');

  const alerts: string[] = [];
  if (revenge.length > 0) alerts.push(`${revenge.length} entrée(s) de revanche`);
  if (overtrading.length > 0) alerts.push(`${overtrading.length} trade(s) au-delà du plafond quotidien`);
  const summary =
    stats.count === 0
      ? `Aucun trade enregistré sur ${range.emptyText}.`
      : `${stats.count} trade(s) sur ${tradedCount} ${period === '12m' ? 'mois' : 'jour(s)'} de trading, P&L net ${formatMoney(stats.netPnl, currency, true)}.` +
        (alerts.length > 0 ? ` Points de vigilance : ${alerts.join(' et ')}.` : ' Aucun signal de comportement détecté.');

  const chartData = dayRows.map((d) => ({
    key: d.key,
    label: period === 'semaine' ? capFirst(dayText(d.key, { weekday: 'short' })) : shortDate(d.key),
    pnl: d.pnl,
  }));
  const barRadius: [number, number, number, number] = period === 'semaine' ? [6, 6, 6, 6] : [3, 3, 3, 3];

  // Bilan annuel : P&L de chaque mois, et cumul depuis le début de la fenêtre (ligne de tendance)
  let running = 0;
  const yearChart = (period === '12m' ? tableRows : []).map((row) => {
    running = round2(running + row.stats.netPnl);
    return { key: row.key, label: shortMonth(row.key), pnl: round2(row.stats.netPnl), cum: running };
  });

  const changePeriod = (next: ReportPeriod) => {
    setPeriod(next);
    setOffset(0);
  };

  // Le bilan annuel avance par année entière ; la semaine et le mois avancent d’un cran
  const step = period === '12m' ? YEAR_MONTHS : 1;
  const previousLabel = period === 'semaine' ? 'Semaine précédente' : period === 'mois' ? 'Mois précédent' : 'Les douze mois précédents';
  const nextLabel = period === 'semaine' ? 'Semaine suivante' : period === 'mois' ? 'Mois suivant' : 'Les douze mois suivants';
  const currentLabel = period === 'semaine' ? 'Cette semaine' : period === 'mois' ? 'Ce mois-ci' : 'Les douze derniers mois';

  return (
    <>
      <div className="mb-6 hidden items-center justify-between border-b border-black/25 pb-3 text-black print:flex">
        <Logo mono size="sm" />
        <span className="text-xs">Imprimé le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>
      <PageHeader
        title={period === 'semaine' ? 'Bilan de la semaine' : period === 'mois' ? 'Bilan du mois' : 'Bilan sur douze mois'}
        description={range.description}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Segmented id="report-period" label="Période du bilan" options={PERIODS} value={period} onChange={changePeriod} />
            <Button size="sm" onClick={() => setOffset((o) => o + step)} aria-label={previousLabel}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button size="sm" disabled={offset === 0} onClick={() => setOffset(0)}>
              {currentLabel}
            </Button>
            <Button size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - step))} aria-label={nextLabel}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button size="sm" variant="primary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden />
              Imprimer / PDF
            </Button>
          </div>
        }
      />

      {currencies.length > 1 && (
        <p className="no-print mb-5 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent-hi">
          Comptes en devises différentes : les montants sont additionnés sans conversion.
        </p>
      )}

      <Card className="mb-6 p-6 md:p-7">
        <p className="font-serif text-2xl leading-snug text-fg md:text-3xl">{summary}</p>
      </Card>

      <StatStrip>
        <Stat
          label="P&L net"
          value={<PnlAmount value={stats.netPnl} currency={currency} />}
          sub={`${range.previousLabel} ${formatMoney(previousPnl, currency, true)}`}
          spark={sparks.pnl}
          sparkTone={pnlTone(stats.netPnl)}
        />
        <Stat label="Trades" value={stats.count} sub={`${stats.wins} G · ${stats.losses} P · ${stats.breakeven} BE`} />
        <Stat
          label="Réussite"
          value={formatPercent(stats.count > 0 ? stats.winRate : null)}
          spark={sparks.winRate}
          sparkTone="accent"
        />
        <Stat
          label="Profit factor"
          value={formatProfitFactor(stats.profitFactor)}
          spark={sparks.profitFactor}
          sparkTone={factorTone(stats.profitFactor)}
        />
      </StatStrip>
      <StatStrip className="mt-px">
        <Stat label={range.countLabel} value={`${tradedCount} / ${countTotal}`} sub={range.countSub} />
        <Stat
          label={range.extremeLabel.best}
          value={best ? <PnlAmount value={best.pnl} currency={currency} /> : '—'}
          sub={best?.label}
        />
        <Stat
          label={range.extremeLabel.worst}
          value={worst ? <PnlAmount value={worst.pnl} currency={currency} /> : '—'}
          sub={worst?.label}
        />
        <Stat
          label="Plan respecté"
          value={formatPercent(stats.planRespectedRate)}
          sub={`${periodTrades.filter((t) => t.plan_respected !== null).length} trade(s) suivis`}
        />
      </StatStrip>

      <Card className="mt-6">
        <SectionTitle title={range.chartTitle} description={range.chartNote} />
        <div className={period === '12m' ? 'h-64 w-full' : 'h-56 w-full'}>
          {period === '12m' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={yearChart} margin={{ top: 26, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={palette.grid} strokeDasharray="2 6" vertical={false} />
                {/* Pas d’intervalle imposé : Recharts saute les mois qui se chevauchent quand la fenêtre est étroite */}
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="month"
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={(v: number) => formatNumber(v, 0)}
                />
                <YAxis
                  yAxisId="cumul"
                  orientation="right"
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={(v: number) => formatNumber(v, 0)}
                />
                <ReferenceLine y={0} yAxisId="month" stroke={palette.cursor} />
                <Tooltip
                  cursor={{ fill: palette.cursorFill }}
                  contentStyle={{
                    background: palette.surface,
                    border: `1px solid ${palette.cursor}`,
                    borderRadius: 12,
                    fontSize: 12,
                    color: palette.text,
                  }}
                  formatter={(value) => formatMoney(Number(value), currency, true)}
                />
                <Bar yAxisId="month" dataKey="pnl" name="P&L du mois" radius={[4, 4, 4, 4]}>
                  {yearChart.map((d) => (
                    <Cell key={d.key} fill={d.pnl >= 0 ? `rgb(${gainRgb})` : `rgb(${lossRgb})`} />
                  ))}
                  <LabelList dataKey="pnl" content={renderValueLabel} />
                </Bar>
                <Line
                  yAxisId="cumul"
                  type="monotone"
                  dataKey="cum"
                  name="Cumul"
                  stroke={palette.equity}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: palette.equity, stroke: palette.surface, strokeWidth: 1.5 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={palette.grid} strokeDasharray="2 6" vertical={false} />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval={period === 'semaine' ? 0 : 2} />
                <YAxis
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={(v: number) => formatNumber(v, 0)}
                />
                <ReferenceLine y={0} stroke={palette.cursor} />
                <Tooltip
                  cursor={{ fill: palette.cursorFill }}
                  contentStyle={{
                    background: palette.surface,
                    border: `1px solid ${palette.cursor}`,
                    borderRadius: 12,
                    fontSize: 12,
                    color: palette.text,
                  }}
                  formatter={(value) => formatMoney(Number(value), currency, true)}
                />
                <Bar dataKey="pnl" name="P&L net" radius={barRadius}>
                  {chartData.map((d) => (
                    <Cell key={d.key} fill={d.pnl >= 0 ? `rgb(${gainRgb})` : `rgb(${lossRgb})`} />
                  ))}
                  {period === 'semaine' && <LabelList dataKey="pnl" content={renderValueLabel} />}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {period === '12m' && (
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgb(${gainRgb})` }} aria-hidden />
              Mois gagnant
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgb(${lossRgb})`, backgroundImage: LOSS_HATCH }} aria-hidden />
              Mois perdant
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 border-t-2" style={{ borderColor: palette.equity }} aria-hidden />
              Cumul depuis le début de la fenêtre
            </li>
          </ul>
        )}
      </Card>

      <Card className="mt-6 overflow-hidden p-0">
        <div className="px-5 pt-5">
          <SectionTitle
            title={range.rowTitle}
            description={
              period === 'mois'
                ? 'Les semaines civiles du mois, du lundi au dimanche, tronquées aux bords du mois.'
                : period === '12m'
                  ? 'Un mois par ligne, du plus ancien au plus récent.'
                  : undefined
            }
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm md:min-w-[520px]">
            <thead className="border-y border-line bg-surface-2/50 text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">{range.rowHead}</th>
                <th className="px-3 py-2.5 text-right font-medium">Trades</th>
                <th className="px-3 py-2.5 text-right font-medium">P&amp;L net</th>
                <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Réussite</th>
                <th className="hidden px-5 py-2.5 font-medium md:table-cell">Signaux</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tableRows.map((row) => (
                <tr key={row.key} className="transition-colors hover:bg-surface-2/50">
                  <td className={cn('px-5 py-3', row.list.length > 0 ? 'text-fg-2' : 'text-muted')}>
                    {row.label}
                    <div className="mt-1.5 flex flex-wrap gap-1.5 md:hidden">
                      <DaySignals count={row.list.length} revenge={row.revenge} overtrading={row.overtrading} />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted">{row.list.length}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {row.list.length > 0 ? <PnlAmount value={row.stats.netPnl} currency={currency} /> : <span className="text-muted">—</span>}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-muted md:table-cell">
                    {row.list.length === 0 ? '—' : formatPercent(row.stats.winRate)}
                  </td>
                  <td className="hidden px-5 py-3 md:table-cell">
                    <div className="flex flex-wrap gap-1.5">
                      <DaySignals count={row.list.length} revenge={row.revenge} overtrading={row.overtrading} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <SectionTitle
            title="Signaux de comportement"
            description="Repérés automatiquement. Ce sont des indices à vérifier sur les trades concernés, pas des verdicts."
          />
          {revenge.length === 0 && overtrading.length === 0 ? (
            <p className="flex items-start gap-2 text-sm text-fg-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gain" aria-hidden />
              Aucun signal {range.emptyText} : pas d’entrée de revanche ni de surtrading détecté.
            </p>
          ) : (
            <div className="space-y-6">
              {revenge.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-fg">Entrées de revanche</h3>
                    <span className="text-xs tabular-nums text-muted">
                      {revenge.length} trade(s) · P&amp;L {formatMoney(sumNet(revenge), currency, true)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Ouverture moins de {REVENGE_WINDOW_MINUTES} min après la clôture d’une perte.
                  </p>
                  <ul className="mt-2 divide-y divide-line">
                    {revenge.map((t) => (
                      <SignalItem key={t.id} trade={t} currency={currencyOf(t)} note="Ouvert peu après une perte" />
                    ))}
                  </ul>
                </div>
              )}
              {overtrading.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-fg">Surtrading</h3>
                    <span className="text-xs tabular-nums text-muted">
                      {overtrading.length} trade(s) en trop · P&amp;L {formatMoney(sumNet(overtrading), currency, true)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Au-delà de {MAX_TRADES_PER_DAY} trades par jour sur un même compte.
                  </p>
                  <ul className="mt-2 divide-y divide-line">
                    {overtrading.map((t) => (
                      <SignalItem key={t.id} trade={t} currency={currencyOf(t)} note={`Trade n°${MAX_TRADES_PER_DAY + 1} ou plus de la journée`} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <SectionTitle
            title="Objectifs & prévision"
            description="Date estimée d’atteinte de l’objectif, au rythme des 30 derniers jours, calculée à partir d’aujourd’hui."
          />
          {withTarget.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted">
              Aucun compte avec objectif de profit. Renseigne un objectif dans les règles d’un compte pour voir la prévision.
            </p>
          ) : (
            <ul className="space-y-3">
              {withTarget.map(({ account, forecast }) => (
                <ForecastRow key={account.id} account={account} forecast={forecast} />
              ))}
            </ul>
          )}
          {withoutTarget.length > 0 && (
            <p className="mt-4 text-xs text-muted">Sans objectif : {withoutTarget.map((f) => f.account.name).join(', ')}.</p>
          )}
          <p className="mt-5 text-xs leading-relaxed text-muted">
            Estimation indicative, pas une prévision : elle suppose que le rythme récent se maintient et ignore les drawdowns à
            venir.
          </p>
        </Card>
      </div>
    </>
  );
}
