import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Plus, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useAccounts, useNotes, useProfile, useRefresh, useRepo, useTrades } from '../data/hooks';
import { WeekStrip } from '../components/charts/WeekStrip';
import { DailyPnlChart } from '../components/charts/DailyPnlChart';
import { EquityPanel } from '../components/charts/EquityPanel';
import { dailyBars, type DayBar } from '../lib/chartData';
import { computeStats, dailyMap, floatingPnl, isOpen, sortByTradeTime, tradeTime } from '../lib/metrics';
import { monthDays, shiftMonthKey } from '../lib/patterns';
import { evaluateAccount, hasAnyRule, resolveAmount } from '../lib/rules';
import { capFirst, dayKey, formatDate, formatDateTime, formatMoney, formatPercent, formatProfitFactor, formatR } from '../lib/format';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from '../lib/constants';
import { loadDemoData } from '../lib/demoData';
import type { AccountReport } from '../lib/alerts';
import { useRuleAlerts } from '../components/useRuleAlerts';
import { DashboardSkeleton } from '../components/Skeleton';
import { OpenPositions } from '../components/OpenPositions';
import { RuinPanel } from '../components/charts/RuinPanel';
import { TodayPanel } from '../components/TodayPanel';
import { LEVEL_UI, RuleCard } from '../components/RuleCard';
import { errorMessage, useToast } from '../components/Toast';
import {
  Badge,
  Button,
  CountUp,
  EmptyState,
  Figure,
  LedgerRow,
  PageHeader,
  Panel,
  PnlAmount,
  Select,
  TickRail,
  buttonStyles,
  cn,
  type RailTone,
} from '../components/ui';

/**
 * Section du tableau de bord : un titre serif, une phrase, un filet. Le tableau de bord se lit
 * de haut en bas — d’abord ce qui se passe maintenant, puis la performance, le risque, le rythme.
 */
function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <header className="mb-4 border-b border-line pb-3">
        <h2 className="font-serif text-2xl leading-none text-fg">{title}</h2>
        {description && <p className="mt-1.5 text-xs leading-relaxed text-muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

/** Teinte de la réglette du respect du plan : la discipline se lit aussi à l'œil, le chiffre reste écrit. */
function planTone(rate: number | null): RailTone {
  if (rate === null) return 'accent';
  if (rate >= 80) return 'gain';
  if (rate >= 60) return 'accent';
  return 'danger';
}

export default function DashboardPage() {
  const { mode } = useAuth();
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: trades, isLoading: loadingTrades } = useTrades();
  const { data: profile } = useProfile();
  const { data: notes } = useNotes();
  const [scope, setScope] = useState('all');

  // Alertes sortantes : tous les comptes à règles, même ceux masqués par le filtre affiché.
  const alertEntries = useMemo<AccountReport[]>(() => {
    const list = accounts ?? [];
    const allTrades = trades ?? [];
    return list
      .filter((account) => account.status !== 'archived' && hasAnyRule(account))
      .map((account) => ({
        accountId: account.id,
        accountName: account.name,
        currency: account.currency,
        report: evaluateAccount(account, allTrades.filter((t) => t.account_id === account.id)),
      }));
  }, [accounts, trades]);
  useRuleAlerts(alertEntries, dayKey(new Date(), profile?.default_timezone ?? DEFAULT_TIMEZONE));

  const sample = useMutation({
    mutationFn: () => loadDemoData(repo),
    onSuccess: async () => {
      await refresh();
      toast.show('Données d’exemple chargées');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  if (loadingAccounts || loadingTrades) return <DashboardSkeleton />;

  const accountList = accounts ?? [];
  const tradeList = trades ?? [];
  const accountById = new Map(accountList.map((a) => [a.id, a]));
  const defaultTz = profile?.default_timezone ?? DEFAULT_TIMEZONE;
  const defaultCurrency = profile?.default_currency ?? DEFAULT_CURRENCY;

  if (accountList.length === 0) {
    return (
      <>
        <PageHeader
          title="Tableau de bord"
          description="Une vue d’ensemble de tes comptes, de tes statistiques et de tes règles."
        />
        <EmptyState
          icon={<Wallet className="h-6 w-6" aria-hidden />}
          title="Commence par créer un compte"
          description="Ajoute ton compte personnel ou ton challenge prop firm : le journal en déduit les règles à surveiller."
          action={
            <>
              <Link to="/comptes/nouveau" className={buttonStyles('primary')}>
                <Plus className="h-4 w-4" aria-hidden />
                Créer un compte
              </Link>
              {mode === 'local' && (
                <Button loading={sample.isPending} onClick={() => sample.mutate()}>
                  Charger des données d’exemple
                </Button>
              )}
            </>
          }
        />
      </>
    );
  }

  const activeAccounts = accountList.filter((a) => a.status !== 'archived');
  const scopeAccounts = scope === 'all' ? activeAccounts : accountList.filter((a) => a.id === scope);
  const scopeIds = new Set(scopeAccounts.map((a) => a.id));
  const scopeTrades = tradeList.filter((t) => scopeIds.has(t.account_id));
  const single = scope === 'all' ? undefined : accountById.get(scope);
  const tz = single?.day_timezone ?? defaultTz;
  const currencies = [...new Set(scopeAccounts.map((a) => a.currency))];
  const currency = currencies.length === 1 ? currencies[0] : defaultCurrency;
  const startingBalance = scopeAccounts.reduce((sum, a) => sum + a.initial_balance, 0);

  const stats = computeStats(scopeTrades, tz);
  const openCount = scopeTrades.filter(isOpen).length;
  const floating = openCount > 0 ? floatingPnl(scopeTrades) : 0;
  const recent = sortByTradeTime(scopeTrades).slice(-6).reverse();
  const planTracked = scopeTrades.filter((t) => t.plan_respected !== null).length;
  const planYes = scopeTrades.filter((t) => t.plan_respected === true).length;
  const days = dailyBars(scopeTrades, tz);
  const daily = dailyMap(scopeTrades, tz);
  const bestDay = days.reduce<DayBar | null>((best, d) => (best === null || d.pnl > best.pnl ? d : best), null);
  // Règles du compte seul : le seuil et l’objectif s’affichent sur la courbe (pas de règle sur un total multi-comptes)
  const rule = single
    ? {
        maxLoss: resolveAmount(single.max_loss_amount, single.max_loss_pct, single.initial_balance),
        target: resolveAmount(single.profit_target_amount, single.profit_target_pct, single.initial_balance),
        trailing: single.drawdown_type === 'trailing',
      }
    : undefined;
  const reports = scopeAccounts.filter(hasAnyRule).map((account) => ({
    account,
    report: evaluateAccount(
      account,
      tradeList.filter((t) => t.account_id === account.id),
    ),
  }));

  // Comptes dont une règle est au-delà du seuil « dans les règles » : affichés en tête de page
  const alerting = reports.filter(({ report }) => report.overall !== 'ok');

  // Panneau du jour : réalisé du jour, flottant, limite journalière la plus serrée et checklist
  const today = dayKey(new Date(), tz);
  const closedToday = scopeTrades.filter((t) => !isOpen(t) && dayKey(tradeTime(t), tz) === today);
  const pnlToday = closedToday.reduce((sum, t) => sum + t.net_pnl, 0);
  const dailyGauges = reports
    .map(({ report }) => report.gauges.find((g) => g.key === 'daily'))
    .filter((g): g is NonNullable<typeof g> => g !== undefined);
  const tightestDaily =
    currencies.length === 1 && dailyGauges.length > 0
      ? dailyGauges.reduce((tightest, gauge) => ((gauge.remaining ?? Infinity) < (tightest.remaining ?? Infinity) ? gauge : tightest))
      : null;
  const note = (notes ?? []).find((n) => n.date === today) ?? null;
  const checklistDone = [...new Set(closedToday.flatMap((t) => t.checklist_done))];

  // Bilan du mois en cours, du 1er à aujourd’hui : les jours à venir ne comptent pas comme « sans trade ».
  // Le mois précédent sert de repère, comme sur la page Bilan.
  const monthKey = today.slice(0, 7);
  const month = monthDays(monthKey).filter((day) => day <= today);
  const inMonth = new Set(month);
  const monthTrades = scopeTrades.filter((t) => inMonth.has(dayKey(tradeTime(t), tz)));
  const monthStats = computeStats(monthTrades, tz);
  const monthDaily = dailyMap(monthTrades, tz);
  const tradedDays = month.filter((day) => monthDaily.has(day));
  const monthBest = tradedDays.reduce<{ day: string; pnl: number } | null>((best, day) => {
    const pnl = monthDaily.get(day)?.pnl ?? 0;
    return best === null || pnl > best.pnl ? { day, pnl } : best;
  }, null);
  const monthWorst = tradedDays.reduce<{ day: string; pnl: number } | null>((worst, day) => {
    const pnl = monthDaily.get(day)?.pnl ?? 0;
    return worst === null || pnl < worst.pnl ? { day, pnl } : worst;
  }, null);
  const previousMonth = shiftMonthKey(monthKey, -1);
  const previousDays = new Set(monthDays(previousMonth));
  const previousPnl = scopeTrades
    .filter((t) => !isOpen(t) && previousDays.has(dayKey(tradeTime(t), tz)))
    .reduce((sum, t) => sum + t.net_pnl, 0);
  const monthLabel = capFirst(formatDate(`${monthKey}-01T12:00:00Z`, { month: 'long', year: 'numeric', timeZone: 'UTC' }));
  const dayMonthLabel = (day: string) => capFirst(formatDate(`${day}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }));

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Ce que tu gagnes, ce que tu risques et si tu respectes tes règles."
        actions={
          <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Compte" className="min-w-52">
            <option value="all">Tous les comptes actifs</option>
            {accountList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        }
      />

      <TodayPanel
        className="mb-6"
        day={today}
        tradesToday={closedToday.length}
        pnlToday={pnlToday}
        floating={floating}
        openCount={openCount}
        currency={currency}
        daily={tightestDaily}
        checklist={profile?.checklist ?? []}
        checklistDone={checklistDone}
        mood={note?.mood ?? null}
        plan={note?.plan ?? null}
      />

      {currencies.length > 1 && (
        <p className="mb-5 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent-hi">
          Comptes en devises différentes : les montants sont additionnés sans conversion. Filtre sur un compte pour une lecture
          exacte.
        </p>
      )}

      {alerting.length > 0 && (
        <section aria-label="Alertes de règles" className="mb-6 space-y-2">
          {alerting.map(({ account, report }) => {
            const ui = LEVEL_UI[report.overall];
            const severe = report.overall === 'danger' || report.overall === 'breached';
            return (
              <Link
                key={account.id}
                to="/comptes"
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm transition-colors hover:bg-surface-2',
                  severe ? 'border-loss/30 bg-loss/[0.06]' : 'border-accent/25 bg-accent/[0.05]',
                )}
              >
                <Badge tone={ui.tone}>{ui.label}</Badge>
                <span className="font-medium text-fg">{account.name}</span>
                <span className="min-w-0 text-fg-2">
                  {report.alerts.length > 0 ? report.alerts.join(' · ') : 'Une règle demande ton attention.'}
                </span>
                <span className="ml-auto shrink-0 text-xs font-medium text-accent">Voir les règles →</span>
              </Link>
            );
          })}
        </section>
      )}

      <Section
        title="Performance"
        description="Depuis le début du périmètre affiché. Les positions ouvertes n’entrent pas dans ces chiffres : seules leurs limites de risque les voient."
      >
        {/* Relevé des chiffres clés : libellé en petites capitales, figure monospace alignée en colonne */}
        <section
          aria-label="Indicateurs clés"
          className="stagger grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line min-[768px]:grid-cols-3 min-[1400px]:grid-cols-6"
        >
          <Figure
            className="bg-surface"
            label="P&L net"
            size="lg"
            tone={stats.count === 0 ? 'muted' : stats.netPnl > 0 ? 'gain' : stats.netPnl < 0 ? 'loss' : 'neutral'}
            value={<CountUp value={stats.netPnl} format={(v) => formatMoney(v, currency, true)} className="block" />}
            sub={
              <>
                Brut {formatMoney(stats.grossPnl, currency, true)} · frais {formatMoney(stats.fees, currency)}
                {openCount > 0 && (
                  <>
                    {' · flottant '}
                    <PnlAmount value={floating} currency={currency} />
                  </>
                )}
              </>
            }
          />
          <Figure
            className="bg-surface"
            label="Taux de réussite"
            value={formatPercent(stats.winRate, 0)}
            sub={`${stats.wins} gagnant(s) · ${stats.losses} perdant(s)`}
          />
          <Figure
            className="bg-surface"
            label="Profit factor"
            value={formatProfitFactor(stats.profitFactor)}
            sub="Gains bruts ÷ pertes brutes"
          />
          <Figure
            className="bg-surface"
            label="Espérance / trade"
            value={<PnlAmount value={stats.expectancy} currency={currency} />}
            sub={stats.avgR === null ? 'R : risque non renseigné' : `soit ${formatR(stats.avgR)} par trade`}
          />
          <Figure
            className="bg-surface"
            label="Drawdown réalisé (historique)"
            tone={stats.maxDrawdown > 0 ? 'loss' : 'neutral'}
            value={formatMoney(stats.maxDrawdown, currency)}
            sub="Plus forte baisse depuis le départ"
          />
          <Figure
            className="bg-surface"
            label="Meilleur jour"
            value={bestDay ? <PnlAmount value={bestDay.pnl} currency={currency} /> : '—'}
            sub={bestDay ? `${bestDay.label} · ${bestDay.count} trade(s)` : 'Aucune journée'}
          />
        </section>

        {/* Courbe d’équité et drawdown synchronisés ; à droite, respect du plan et derniers trades */}
        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
            <EquityPanel key={scope} trades={scopeTrades} startingBalance={startingBalance} currency={currency} rule={rule} />

            {/* Le mois en cours sous la courbe : la colonne se remplit au lieu de laisser un vide à côté de la liste des trades */}
            <Panel
              className="flex flex-1 flex-col"
              eyebrow={monthLabel}
              title="Bilan du mois"
              description={`Du 1er au ${formatDate(`${today}T12:00:00Z`, { day: 'numeric', timeZone: 'UTC' })}.`}
              action={
                <Link
                  to="/bilan?periode=mois"
                  className="whitespace-nowrap text-xs font-medium text-accent transition-colors hover:text-accent-hi"
                >
                  Ouvrir le bilan →
                </Link>
              }
              bodyClassName="flex flex-1 flex-col px-0 py-0"
            >
              <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
                <Figure
                  className="bg-surface"
                  label="P&L net"
                  value={<PnlAmount value={monthStats.netPnl} currency={currency} />}
                  sub={`Mois préc. ${formatMoney(previousPnl, currency, true)}`}
                />
                <Figure
                  className="bg-surface"
                  label="Trades"
                  value={monthStats.count}
                  sub={`${monthStats.wins} G · ${monthStats.losses} P · ${monthStats.breakeven} BE`}
                />
                <Figure
                  className="bg-surface"
                  label="Réussite"
                  value={formatPercent(monthStats.count > 0 ? monthStats.winRate : null)}
                  sub="Trades décidés"
                />
                <Figure
                  className="bg-surface"
                  label="Jours tradés"
                  value={`${tradedDays.length} / ${month.length}`}
                  sub="Depuis le 1er du mois"
                />
              </div>

              {monthBest && monthWorst ? (
                <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-3.5 text-xs text-muted">
                  <span className="flex flex-wrap items-center gap-1.5">
                    Meilleur jour <span className="text-fg-2">{dayMonthLabel(monthBest.day)}</span>
                    <PnlAmount value={monthBest.pnl} currency={currency} className="font-medium" />
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    Pire jour <span className="text-fg-2">{dayMonthLabel(monthWorst.day)}</span>
                    <PnlAmount value={monthWorst.pnl} currency={currency} className="font-medium" />
                  </span>
                </div>
              ) : (
                <p className="mt-auto border-t border-line px-5 py-3.5 text-xs text-muted">
                  Aucun trade ce mois-ci : le bilan se remplira au premier trade clôturé.
                </p>
              )}
            </Panel>
          </div>

          <div className="stagger flex min-w-0 flex-col gap-4 lg:col-span-4">
            <OpenPositions
              trades={scopeTrades}
              accountName={(id) => accountById.get(id)?.name ?? '—'}
              currencyOf={(id) => accountById.get(id)?.currency ?? DEFAULT_CURRENCY}
            />

            <Panel eyebrow="Respect du plan" bodyClassName="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span
                  className={cn(
                    'figure text-3xl font-semibold leading-none',
                    stats.planRespectedRate === null ? 'text-muted' : 'text-fg',
                  )}
                >
                  {stats.planRespectedRate === null ? '—' : formatPercent(stats.planRespectedRate, 0)}
                </span>
                <span className="text-[11px] text-muted">des trades renseignés</span>
              </div>
              <TickRail
                className="mt-4"
                ratio={(stats.planRespectedRate ?? 0) / 100}
                ticks={10}
                majorEvery={5}
                tone={planTone(stats.planRespectedRate)}
                ariaLabel={
                  stats.planRespectedRate === null
                    ? 'Respect du plan : aucune donnée'
                    : `Respect du plan : ${formatPercent(stats.planRespectedRate, 0)} des trades renseignés`
                }
                label={
                  <>
                    <span>0 %</span>
                    <span>100 %</span>
                  </>
                }
              />
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                {planYes} trade(s) dans le plan sur {planTracked} renseigné(s)
              </p>
            </Panel>

            <Panel
              className="flex flex-1 flex-col"
              eyebrow="Journal"
              title="Derniers trades"
              action={
                <Link to="/trades" className="text-xs font-medium text-accent transition-colors hover:text-accent-hi">
                  Tout voir
                </Link>
              }
              bodyClassName="flex flex-1 flex-col divide-y divide-line py-1.5"
            >
              {recent.length === 0 ? (
                <p className="py-1 text-sm text-muted">Aucun trade sur ce périmètre pour l’instant.</p>
              ) : (
                <>{recent.map((t) => {
                  const account = accountById.get(t.account_id);
                  return (
                    <LedgerRow
                      key={t.id}
                      href={`/trades/${t.id}`}
                      label={
                        <span className="flex items-center gap-2 font-medium text-fg">
                          {t.instrument}
                          <Badge tone={t.direction === 'long' ? 'good' : 'bad'}>{t.direction === 'long' ? 'Achat' : 'Vente'}</Badge>
                        </span>
                      }
                      sub={`${formatDateTime(t.opened_at)} · ${account?.name ?? '—'}`}
                      value={
                        <PnlAmount value={t.net_pnl} currency={account?.currency ?? DEFAULT_CURRENCY} className="font-semibold" />
                      }
                    />
                  );
                })}</>
              )}
            </Panel>
          </div>
        </div>
      </Section>

      {/* Règles prop firm : marge restante en $, et risque de ruine sur un compte précis */}
      {(reports.length > 0 || single) && (
        <Section
          title="Risque & discipline"
          description="La limite journalière, le drawdown et l’objectif de tes comptes à règles. Les positions ouvertes comptent ici — c’est ce qui peut te sortir d’un challenge."
        >
          {reports.length > 0 && (
            <div className={cn('grid gap-4', reports.length > 1 && 'md:grid-cols-2')}>
              {reports.map(({ account, report }) => (
                <RuleCard key={account.id} account={account} report={report} />
              ))}
            </div>
          )}

          {single && (
            <div className={cn(reports.length > 0 && 'mt-4')}>
              <RuinPanel
                key={single.id}
                account={single}
                trades={tradeList.filter((t) => t.account_id === single.id)}
                currency={single.currency}
              />
            </div>
          )}
        </Section>
      )}

      {/* Rythme : la régularité jour après jour. Le calendrier mensuel complet vit dans le Journal. */}
      <Section title="Rythme" description="Ce que tu fais jour après jour. Le calendrier mensuel complet est dans le Journal.">
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-5">
            <WeekStrip daily={daily} tz={tz} currency={currency} />
          </div>
          <div className="min-w-0 lg:col-span-7">
            <DailyPnlChart key={`daily-${scope}`} bars={days} currency={currency} />
          </div>
        </div>
      </Section>
    </>
  );
}
