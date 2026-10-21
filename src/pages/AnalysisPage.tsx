import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAccounts, useProfile, useTrades } from '../data/hooks';
import { usePalette } from '../components/PaletteContext';
import { detectBehavior, MAX_TRADES_PER_DAY, REVENGE_WINDOW_MINUTES } from '../lib/behavior';
import { extremes } from '../lib/highlights';
import { breakdown, computeStats, isOpen, sortByTradeTime, tradeTime, weekdayOf, type BreakdownRow } from '../lib/metrics';
import { hourGrid, outcomeSplit, rMultiples } from '../lib/chartData';
import { statSparks } from '../lib/spark';
import { rMultiple } from '../lib/tradeQuery';
import { HourDayHeatmap } from '../components/charts/HourDayHeatmap';
import { OutcomeBar } from '../components/charts/OutcomeBar';
import { RHistogram } from '../components/charts/RHistogram';
import { WeekdayPnlChart } from '../components/charts/WeekdayPnlChart';
import { DisciplineChart, type DisciplineGroup } from '../components/charts/DisciplineChart';
import { ComparePanel } from '../components/ComparePanel';
import {
  capFirst,
  dayKey,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatProfitFactor,
  formatR,
  formatSignedCompact,
  signClass,
} from '../lib/format';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, SESSIONS } from '../lib/constants';
import type { Trade } from '../lib/types';
import {
  Badge,
  Card,
  Loading,
  PageHeader,
  PnlAmount,
  SectionTitle,
  Segmented,
  Select,
  Stat,
  StatStrip,
  cn,
  factorTone,
  pnlTone,
} from '../components/ui';

const PERIODS: { value: number; label: string }[] = [
  { value: 30, label: '30 jours' },
  { value: 90, label: '90 jours' },
  { value: 365, label: '12 mois' },
  { value: 0, label: 'Tout' },
];

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];


interface Group {
  title: string;
  short: string;
  rows: BreakdownRow[];
}

/** Trie les lignes selon un ordre donné ; les valeurs inconnues restent en fin de liste. */
function inOrder(rows: BreakdownRow[], order: string[]): BreakdownRow[] {
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index < 0 ? order.length : index;
  };
  return [...rows].sort((a, b) => rank(a.key) - rank(b.key));
}

const average = (list: Trade[]): number | null =>
  list.length === 0 ? null : list.reduce((sum, t) => sum + t.net_pnl, 0) / list.length;

const sumNet = (list: Trade[]) => list.reduce((sum, t) => sum + t.net_pnl, 0);

/** Meilleur ou pire élément d’une répartition, en pastille lisible d’un coup d’œil. */
function Highlight({ label, name, value, currency }: { label: string; name: string; value: number; currency: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-fg">{name}</span>
        <PnlAmount value={value} currency={currency} className="shrink-0 text-sm font-semibold" />
      </div>
    </div>
  );
}

/** Barres centrées sur zéro : gains vers la droite, pertes vers la gauche. Les chiffres exacts sont dans le tableau. */
function DivergingBars({ rows }: { rows: BreakdownRow[] }) {
  const { gainRgb, lossRgb } = usePalette();
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.netPnl)));
  return (
    <ul className="space-y-2.5" aria-hidden>
      {rows.map((r) => {
        const positive = r.netPnl >= 0;
        const barStyle: CSSProperties = {
          width: `${(Math.abs(r.netPnl) / maxAbs) * 50}%`,
          background: `rgb(${positive ? gainRgb : lossRgb})`,
          ...(positive ? { left: '50%' } : { right: '50%' }),
        };
        return (
          <li key={r.key} className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3 text-xs">
            <span className="truncate text-fg-2">{capFirst(r.key)}</span>
            <div className="relative h-2.5 rounded-full bg-surface-3">
              <span className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
              <span className="absolute inset-y-0 rounded-full" style={barStyle} />
            </div>
            <span className="w-16 text-right tabular-nums text-muted">{formatSignedCompact(r.netPnl)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function DimensionTable({ rows, currency, title }: { rows: BreakdownRow[]; currency: string; title: string }) {
  return (
    <div className="-mx-5 overflow-x-auto md:-mx-6">
      <table className="w-full text-sm md:min-w-[420px]">
        <caption className="sr-only">Résultats par {title.toLowerCase()}, en valeurs exactes</caption>
        <thead className="border-y border-line bg-surface-2/50 text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-5 py-2.5 font-medium md:px-6">
              {title}
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Trades
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              P&amp;L net
            </th>
            <th scope="col" className="hidden px-3 py-2.5 text-right font-medium md:table-cell">
              Réussite
            </th>
            <th scope="col" className="hidden px-5 py-2.5 text-right font-medium md:table-cell md:px-6">
              Moy./trade
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key} className="transition-colors hover:bg-surface-2/50">
              <td className="px-5 py-3 text-fg-2 md:px-6">{capFirst(r.key)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-muted">{r.count}</td>
              <td className="px-3 py-3 text-right">
                <PnlAmount value={r.netPnl} currency={currency} className="font-semibold" />
              </td>
              <td className="hidden px-3 py-3 text-right tabular-nums text-muted md:table-cell">{formatPercent(r.winRate)}</td>
              <td className="hidden px-5 py-3 text-right md:table-cell md:px-6">
                <PnlAmount value={r.avgPnl} currency={currency} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Carte à onglets : une seule répartition à la fois, au lieu de huit tableaux empilés. */
function Breakdown({ groups, currency }: { groups: Group[]; currency: string }) {
  const [index, setIndex] = useState(0);
  const active = groups[index];
  const { best, worst } = extremes(active.rows);
  return (
    <Card className="p-5 md:p-6">
      <SectionTitle
        title="Répartition"
        description="Choisis une dimension. Les barres montrent où le P&L se concentre, le tableau donne les valeurs exactes."
      />
      <div className="mb-5">
        <Segmented id="dimension" label="Dimension" options={groups.map((g, i) => ({ value: i, label: g.short }))} value={index} onChange={setIndex} />
      </div>
      {active.rows.length === 0 ? (
        <p className="text-sm text-muted">Aucune donnée pour cette dimension.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {best && <Highlight label="Meilleur" name={capFirst(best.key)} value={best.netPnl} currency={currency} />}
            {worst && <Highlight label="Pire" name={capFirst(worst.key)} value={worst.netPnl} currency={currency} />}
          </div>
          <DivergingBars rows={active.rows} />
          <DimensionTable rows={active.rows} currency={currency} title={active.title} />
        </div>
      )}
    </Card>
  );
}

/** Ligne cliquable vers un trade, pour les signaux de comportement. */
function TradeLine({ trade, currency, note }: { trade: Trade; currency: string; note: string }) {
  return (
    <li>
      <Link
        to={`/trades/${trade.id}`}
        className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
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

function BehaviorCard({
  revenge,
  overtrading,
  overtradingSlots,
  currency,
  currencyOf,
}: {
  revenge: Trade[];
  overtrading: Trade[];
  overtradingSlots: number;
  currency: string;
  currencyOf: (t: Trade) => string;
}) {
  const revengeLatest = revenge.slice(-4).reverse();
  const overtradingLatest = overtrading.slice(-4).reverse();
  return (
    <Card className="p-5">
      <SectionTitle
        title="Comportements"
        description="Signaux repérés automatiquement sur la période. Des indices à vérifier, pas des verdicts."
      />
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-fg">Entrées de revanche</h3>
            <Badge tone={revenge.length > 0 ? 'bad' : 'good'}>{revenge.length} détectée(s)</Badge>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Trade ouvert moins de {REVENGE_WINDOW_MINUTES} min après la clôture d’une perte.
            {revenge.length > 0 && (
              <>
                {' '}
                P&amp;L de ces trades :{' '}
                <span className={cn('font-medium', signClass(sumNet(revenge)))}>{formatMoney(sumNet(revenge), currency, true)}</span>.
              </>
            )}
          </p>
          {revengeLatest.length > 0 && (
            <ul className="mt-2 divide-y divide-line">
              {revengeLatest.map((t) => (
                <TradeLine key={t.id} trade={t} currency={currencyOf(t)} note="Ouvert peu après une perte" />
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-fg">Surtrading</h3>
            <Badge tone={overtrading.length > 0 ? 'warn' : 'good'}>{overtrading.length} trade(s) en trop</Badge>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Plus de {MAX_TRADES_PER_DAY} trades par jour sur un même compte
            {overtradingSlots > 0 ? ` : ${overtradingSlots} journée(s) concernée(s).` : '.'}
          </p>
          {overtradingLatest.length > 0 && (
            <ul className="mt-2 divide-y divide-line">
              {overtradingLatest.map((t) => (
                <TradeLine key={t.id} trade={t} currency={currencyOf(t)} note={`Trade n°${MAX_TRADES_PER_DAY + 1} ou plus de la journée`} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function AnalysisPage() {
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: trades, isLoading: loadingTrades } = useTrades();
  const { data: profile, isLoading: loadingProfile } = useProfile();
  const [accountId, setAccountId] = useState('all');
  const [days, setDays] = useState(0);

  if (loadingAccounts || loadingTrades || loadingProfile) return <Loading />;

  const tz = profile?.default_timezone ?? DEFAULT_TIMEZONE;
  const accountList = accounts ?? [];
  const accountById = new Map(accountList.map((a) => [a.id, a]));
  const currencyOf = new Map(accountList.map((a) => [a.id, a.currency]));
  // Chaque compte découpe ses journées selon son fuseau
  const tzOf = (id: string) => accountById.get(id)?.day_timezone || tz;
  const cutoff = days > 0 ? Date.now() - days * 86_400_000 : Number.NEGATIVE_INFINITY;

  const periodTrades = sortByTradeTime(
    (trades ?? []).filter((t) => new Date(tradeTime(t)).getTime() >= cutoff),
  );
  const scoped = periodTrades.filter((t) => accountId === 'all' || t.account_id === accountId);
  const scopedIds = new Set(scoped.map((t) => t.id));
  const currencies = [...new Set(scoped.map((t) => currencyOf.get(t.account_id) ?? DEFAULT_CURRENCY))];
  const currency = currencies.length === 1 ? currencies[0] : (profile?.default_currency ?? DEFAULT_CURRENCY);

  // Revanche lue sur toute la période (tous comptes), surtrading compté par compte
  const behavior = detectBehavior(periodTrades, tzOf);
  const revenge = sortByTradeTime(behavior.revenge.filter((t) => scopedIds.has(t.id)));
  const overtrading = sortByTradeTime(behavior.overtrading.filter((t) => scopedIds.has(t.id)));
  const overtradingSlots = new Set(overtrading.map((t) => `${t.account_id}|${dayKey(t.opened_at, tzOf(t.account_id))}`)).size;

  const heat = hourGrid(scoped);

  const stats = computeStats(scoped, tz);
  // Le réalisé seulement : une position ouverte n'a pas de résultat, juste un P&L flottant
  const realized = scoped.filter((t) => !isOpen(t));
  const openCount = scoped.length - realized.length;
  // Tendance des chiffres clés, dans l'ordre chronologique : elle dessine le fond des cellules
  const chrono = sortByTradeTime(realized);
  const sparks = statSparks(
    chrono.map((trade) => trade.net_pnl),
    chrono.map((trade) => rMultiple(trade)),
  );
  const planYes = realized.filter((t) => t.plan_respected === true);
  const planNo = realized.filter((t) => t.plan_respected === false);
  const withMistakes = realized.filter((t) => t.mistakes.length > 0);
  const withoutMistakes = realized.filter((t) => t.mistakes.length === 0);

  const rValues = rMultiples(scoped);
  const split = outcomeSplit(scoped);
  const weekdayRows = inOrder(
    breakdown(scoped, (t) => weekdayOf(tradeTime(t), tz)),
    WEEKDAYS,
  );
  const discipline: DisciplineGroup[] = [
    { label: 'Plan suivi', full: 'Plan respecté', value: average(planYes), count: planYes.length },
    { label: 'Plan non suivi', full: 'Plan non respecté', value: average(planNo), count: planNo.length },
    { label: 'Avec erreur', full: 'Erreur commise', value: average(withMistakes), count: withMistakes.length },
    { label: 'Sans erreur', full: 'Sans erreur', value: average(withoutMistakes), count: withoutMistakes.length },
  ];

  const groups: Group[] = [
    { title: 'Session', short: 'Session', rows: inOrder(breakdown(scoped, (t) => t.session), SESSIONS) },
    { title: 'Jour de la semaine', short: 'Jour', rows: weekdayRows },
    { title: 'Instrument', short: 'Instrument', rows: breakdown(scoped, (t) => t.instrument) },
    { title: 'Setup', short: 'Setup', rows: breakdown(scoped, (t) => t.setup) },
    { title: 'Timeframe', short: 'Timeframe', rows: breakdown(scoped, (t) => t.timeframe) },
    { title: 'Émotions avant le trade', short: 'Émotions avant', rows: breakdown(scoped, (t) => t.emotions_before, null) },
    { title: 'Émotions après le trade', short: 'Émotions après', rows: breakdown(scoped, (t) => t.emotions_after, null) },
    { title: 'Erreurs commises', short: 'Erreurs', rows: breakdown(scoped, (t) => t.mistakes, null) },
  ];

  return (
    <>
      <PageHeader
        title="Analyse"
        description="Où gagnes-tu, où perds-tu, et quel impact ta discipline a-t-elle sur tes résultats ?"
        actions={
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Compte" className="min-w-52">
            <option value="all">Tous les comptes</option>
            {accountList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        }
      />

      <div className="mb-6">
        <Segmented id="period" label="Période" options={PERIODS} value={days} onChange={setDays} />
      </div>

      {openCount > 0 && (
        <p className="mb-6 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent-hi">
          {openCount} position{openCount > 1 ? 's' : ''} ouverte{openCount > 1 ? 's' : ''} : cette page ne mesure que le
          réalisé. Le P&L flottant compte dans les limites de risque, pas dans ces statistiques.
        </p>
      )}

      {stats.count === 0 ? (
        <Card>
          <p className="text-sm text-muted">Aucun trade sur cette période. Élargis le filtre pour voir l’analyse.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Vue d’ensemble : six chiffres au maximum */}
          <StatStrip columns={3}>
            <Stat
              label="P&L net"
              value={<PnlAmount value={stats.netPnl} currency={currency} />}
              sub={`${stats.count} trade(s)`}
              spark={sparks.pnl}
              sparkTone={pnlTone(stats.netPnl)}
            />
            <Stat
              label="Réussite"
              value={formatPercent(stats.winRate)}
              sub={`${stats.wins} G · ${stats.losses} P · ${stats.breakeven} BE`}
              spark={sparks.winRate}
              sparkTone="accent"
            />
            <Stat
              label="Profit factor"
              value={formatProfitFactor(stats.profitFactor)}
              spark={sparks.profitFactor}
              sparkTone={factorTone(stats.profitFactor)}
            />
            <Stat
              label="R moyen"
              value={formatR(stats.avgR)}
              valueClass={signClass(stats.avgR)}
              spark={sparks.avgR}
              sparkTone={pnlTone(stats.avgR)}
            />
            <Stat label="Meilleur jour" value={<PnlAmount value={stats.bestDay} currency={currency} />} />
            <Stat label="Pire jour" value={<PnlAmount value={stats.worstDay} currency={currency} />} />
          </StatStrip>

          {/* Répartition des résultats : ce que les chiffres du haut résument */}
          <div className="grid gap-4 md:grid-cols-2">
            <RHistogram values={rValues} />
            <OutcomeBar split={split} />
          </div>

          <Card>
            <SectionTitle title="Discipline" description="Impact du respect du plan et des erreurs sur tes résultats." />
            <StatStrip>
              <Stat label="Plan respecté" value={formatPercent(stats.planRespectedRate)} sub={`${planYes.length} trade(s) suivis`} />
              <Stat label="Moy. si plan suivi" value={<PnlAmount value={average(planYes)} currency={currency} />} />
              <Stat
                label="Moy. si plan non suivi"
                value={<PnlAmount value={average(planNo)} currency={currency} />}
                sub={`${planNo.length} trade(s)`}
              />
              <Stat
                label="Moy. avec erreur"
                value={<PnlAmount value={average(withMistakes)} currency={currency} />}
                sub={`${withMistakes.length} sans erreur : ${formatMoney(average(withoutMistakes), currency, true)}`}
              />
            </StatStrip>
            <div className="mt-5">
              <DisciplineChart groups={discipline} currency={currency} />
            </div>
          </Card>

          {/* Détails repliés : gains et pertes moyens, régularité */}
          <details className="group rounded-2xl border border-line bg-surface/60 p-5 shadow-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-fg-2 transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
              Plus de détails : gains et pertes moyens, régularité
              <span className="text-xs font-normal text-muted group-open:hidden">Afficher</span>
              <span className="hidden text-xs font-normal text-muted group-open:inline">Masquer</span>
            </summary>
            <div className="mt-5">
              <StatStrip columns={3}>
                <Stat label="Gain moyen" value={<PnlAmount value={stats.avgWin} currency={currency} />} />
                <Stat label="Perte moyenne" value={<PnlAmount value={stats.avgLoss} currency={currency} />} />
                <Stat label="Série de gains" value={`${stats.maxWinStreak} trade(s)`} valueClass="text-gain" sub="Plus longue suite" />
                <Stat label="Série de pertes" value={`${stats.maxLossStreak} trade(s)`} valueClass="text-loss" sub="Plus longue suite" />
                <Stat
                  label="Jours tradés"
                  value={stats.tradingDays}
                  sub={`${formatNumber(stats.count / Math.max(1, stats.tradingDays), 1)} trade(s) par jour`}
                />
                <Stat
                  label="Drawdown réalisé"
                  value={formatMoney(stats.maxDrawdown, currency)}
                  valueClass={stats.maxDrawdown > 0 ? 'text-loss' : undefined}
                  sub="Plus forte baisse"
                />
              </StatStrip>
            </div>
          </details>

          <BehaviorCard
            revenge={revenge}
            overtrading={overtrading}
            overtradingSlots={overtradingSlots}
            currency={currency}
            currencyOf={(t) => currencyOf.get(t.account_id) ?? DEFAULT_CURRENCY}
          />

          <WeekdayPnlChart rows={weekdayRows} currency={currency} />

          <Card>
            <SectionTitle
              title="Jour × heure d’entrée"
              description="Où se concentrent tes gains et tes pertes dans la semaine, à l’heure de New York. Lis-le comme une piste, pas comme une règle."
            />
            <HourDayHeatmap grid={heat} currency={currency} />
          </Card>

          <Breakdown groups={groups} currency={currency} />
        </div>
      )}

      {/* Comparaison : mesurer un progrès dans le temps, ou deux comptes l’un contre l’autre */}
      <div className="mt-6">
        <ComparePanel trades={trades ?? []} accounts={accountList} tz={tz} currency={currency} periods={PERIODS} />
      </div>
    </>
  );
}
