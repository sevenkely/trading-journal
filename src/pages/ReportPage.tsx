import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePalette } from '../components/PaletteContext';
import { CheckCircle2, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useAccounts, useProfile, useTrades } from '../data/hooks';
import { detectBehavior, MAX_TRADES_PER_DAY, REVENGE_WINDOW_MINUTES } from '../lib/behavior';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from '../lib/constants';
import { forecastTarget, type Forecast } from '../lib/forecast';
import { capFirst, dayKey, formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, formatProfitFactor, formatSignedCompact } from '../lib/format';
import { computeStats, sortByTradeTime, tradeTime } from '../lib/metrics';
import { mondayOf, shiftDays, weekKeys } from '../lib/patterns';
import type { Account, Trade } from '../lib/types';
import { Badge, Button, Card, Loading, PageHeader, SectionTitle, Stat, StatStrip, cn, PnlAmount, type Tone } from '../components/ui';

const AXIS = { fill: '#7d8899', fontSize: 11 };
const TOOLTIP = {
  background: '#0d1118',
  border: '1px solid #243043',
  borderRadius: 12,
  fontSize: 12,
  boxShadow: '0 16px 40px -12px rgb(0 0 0 / 0.7)',
};

interface DayRow {
  key: string;
  count: number;
  pnl: number;
  winRate: number | null;
  overtrading: number;
  revenge: number;
}

/** Libellé d’une date YYYY-MM-DD, lu en UTC pour ne jamais décaler le jour. */
function dayText(key: string, options: Intl.DateTimeFormatOptions): string {
  return formatDate(`${key}T12:00:00Z`, { ...options, timeZone: 'UTC' });
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
    <text x={x + width / 2} y={value > 0 ? top - 6 : bottom + 13} textAnchor="middle" fontSize={11} fill="#b9c2d0">
      {formatSignedCompact(value)}
    </text>
  );
}

export default function ReportPage() {
  const { gainRgb, lossRgb } = usePalette();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: trades, isLoading: loadingTrades } = useTrades();
  const { data: profile, isLoading: loadingProfile } = useProfile();
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [now] = useState(() => new Date());

  if (loadingAccounts || loadingTrades || loadingProfile) return <Loading />;

  const tz = profile?.default_timezone ?? DEFAULT_TIMEZONE;
  const defaultCurrency = profile?.default_currency ?? DEFAULT_CURRENCY;
  const accountList = accounts ?? [];
  const accountById = new Map(accountList.map((a) => [a.id, a]));
  // Chaque compte découpe ses journées selon son propre fuseau
  const tzOf = (accountId: string) => accountById.get(accountId)?.day_timezone || tz;
  const currencyOf = (t: Trade) => accountById.get(t.account_id)?.currency ?? defaultCurrency;
  const dayOf = (t: Trade) => dayKey(tradeTime(t), tzOf(t.account_id));
  const allTrades = trades ?? [];

  const week = weekKeys(mondayOf(now, tz, weeksAgo));
  const inWeek = new Set(week);
  const previousWeek = new Set(weekKeys(shiftDays(week[0], -7)));
  const weekTrades = sortByTradeTime(allTrades.filter((t) => inWeek.has(dayOf(t))));
  const previousPnl = sumNet(allTrades.filter((t) => previousWeek.has(dayOf(t))));
  const currencies = [...new Set(weekTrades.map(currencyOf))];
  const currency = currencies.length === 1 ? currencies[0] : defaultCurrency;

  // Revanche : lue sur toute la chronologie, pour qu’une perte de la veille compte aussi
  const behavior = detectBehavior(allTrades, tzOf);
  const revenge = sortByTradeTime(behavior.revenge.filter((t) => inWeek.has(dayOf(t))));
  const overtrading = sortByTradeTime(behavior.overtrading.filter((t) => inWeek.has(dayOf(t))));
  const revengeIds = new Set(revenge.map((t) => t.id));
  const overtradingIds = new Set(overtrading.map((t) => t.id));

  const stats = computeStats(weekTrades);
  const days: DayRow[] = week.map((key) => {
    const list = weekTrades.filter((t) => dayOf(t) === key);
    const dayStats = computeStats(list);
    return {
      key,
      count: list.length,
      pnl: dayStats.netPnl,
      winRate: list.length === 0 ? null : dayStats.winRate,
      overtrading: list.filter((t) => overtradingIds.has(t.id)).length,
      revenge: list.filter((t) => revengeIds.has(t.id)).length,
    };
  });
  const traded = days.filter((d) => d.count > 0);
  const best = traded.length > 0 ? traded.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null;
  const worst = traded.length > 0 ? traded.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null;

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
      ? 'Aucun trade enregistré sur cette semaine.'
      : `${stats.count} trade(s) sur ${traded.length} jour(s) de trading, P&L net ${formatMoney(stats.netPnl, currency, true)}.` +
        (alerts.length > 0 ? ` Points de vigilance : ${alerts.join(' et ')}.` : ' Aucun signal de comportement détecté.');

  const chartData = days.map((d) => ({ label: capFirst(dayText(d.key, { weekday: 'short' })), pnl: d.pnl, key: d.key }));

  return (
    <>
      <PageHeader
        title="Bilan de la semaine"
        description={`Du ${dayText(week[0], { day: 'numeric', month: 'long' })} au ${dayText(week[6], { day: 'numeric', month: 'long', year: 'numeric' })}.`}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setWeeksAgo((w) => w + 1)} aria-label="Semaine précédente">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button size="sm" disabled={weeksAgo === 0} onClick={() => setWeeksAgo(0)}>
              Cette semaine
            </Button>
            <Button size="sm" disabled={weeksAgo === 0} onClick={() => setWeeksAgo((w) => Math.max(0, w - 1))} aria-label="Semaine suivante">
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
          sub={`Sem. préc. ${formatMoney(previousPnl, currency, true)}`}
        />
        <Stat label="Trades" value={stats.count} sub={`${stats.wins} G · ${stats.losses} P · ${stats.breakeven} BE`} />
        <Stat label="Réussite" value={formatPercent(stats.count > 0 ? stats.winRate : null)} />
        <Stat label="Profit factor" value={formatProfitFactor(stats.profitFactor)} />
      </StatStrip>
      <StatStrip className="mt-px">
        <Stat label="Jours tradés" value={`${traded.length} / 7`} sub="Du lundi au dimanche" />
        <Stat
          label="Meilleur jour"
          value={best ? <PnlAmount value={best.pnl} currency={currency} /> : '—'}
          sub={best ? capFirst(dayText(best.key, { weekday: 'long', day: 'numeric' })) : undefined}
        />
        <Stat
          label="Pire jour"
          value={worst ? <PnlAmount value={worst.pnl} currency={currency} /> : '—'}
          sub={worst ? capFirst(dayText(worst.key, { weekday: 'long', day: 'numeric' })) : undefined}
        />
        <Stat
          label="Plan respecté"
          value={formatPercent(stats.planRespectedRate)}
          sub={`${weekTrades.filter((t) => t.plan_respected !== null).length} trade(s) suivis`}
        />
      </StatStrip>

      <Card className="mt-6">
        <SectionTitle title="P&L par jour" description="Gains en vert, pertes en rouge. Chaque compte découpe ses journées selon son fuseau." />
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1b2433" strokeDasharray="2 6" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={(v: number) => formatNumber(v, 0)}
              />
              <ReferenceLine y={0} stroke="#334056" />
              <Tooltip
                cursor={{ fill: 'rgb(255 255 255 / 0.03)' }}
                contentStyle={TOOLTIP}
                formatter={(value) => formatMoney(Number(value), currency, true)}
              />
              <Bar dataKey="pnl" name="P&L net" radius={[6, 6, 6, 6]}>
                {chartData.map((d) => (
                  <Cell key={d.key} fill={d.pnl >= 0 ? `rgb(${gainRgb})` : `rgb(${lossRgb})`} />
                ))}
                <LabelList dataKey="pnl" content={renderValueLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="mt-6 overflow-hidden p-0">
        <div className="px-5 pt-5">
          <SectionTitle title="Jour par jour" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm md:min-w-[520px]">
            <thead className="border-y border-line bg-surface-2/50 text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Jour</th>
                <th className="px-3 py-2.5 text-right font-medium">Trades</th>
                <th className="px-3 py-2.5 text-right font-medium">P&amp;L net</th>
                <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Réussite</th>
                <th className="hidden px-5 py-2.5 font-medium md:table-cell">Signaux</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {days.map((d) => (
                <tr key={d.key} className="transition-colors hover:bg-surface-2/50">
                  <td className={cn('px-5 py-3', d.count > 0 ? 'text-fg-2' : 'text-muted')}>
                    {capFirst(dayText(d.key, { weekday: 'long', day: 'numeric', month: 'short' }))}
                    <div className="mt-1.5 flex flex-wrap gap-1.5 md:hidden">
                      <DaySignals count={d.count} revenge={d.revenge} overtrading={d.overtrading} />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted">{d.count}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {d.count > 0 ? <PnlAmount value={d.pnl} currency={currency} /> : <span className="text-muted">—</span>}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-muted md:table-cell">
                    {d.winRate === null ? '—' : formatPercent(d.winRate)}
                  </td>
                  <td className="hidden px-5 py-3 md:table-cell">
                    <div className="flex flex-wrap gap-1.5">
                      <DaySignals count={d.count} revenge={d.revenge} overtrading={d.overtrading} />
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
              Aucun signal cette semaine : pas d’entrée de revanche ni de surtrading détecté.
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
