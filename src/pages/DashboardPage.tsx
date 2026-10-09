import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Plus, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useAccounts, useProfile, useRefresh, useRepo, useTrades } from '../data/hooks';
import { CalendarHeatmap } from '../components/charts/CalendarHeatmap';
import { ChartFrame } from '../components/charts/ChartFrame';
import { DailyPnlChart } from '../components/charts/DailyPnlChart';
import { EquityPanel } from '../components/charts/EquityPanel';
import { dailyBars, type DayBar } from '../lib/chartData';
import { computeStats, dailyMap, sortByTradeTime } from '../lib/metrics';
import { evaluateAccount, hasAnyRule, resolveAmount } from '../lib/rules';
import { dayKey, formatDateTime, formatMoney, formatPercent, formatProfitFactor, formatR, signClass } from '../lib/format';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from '../lib/constants';
import { loadDemoData } from '../lib/demoData';
import { DashboardSkeleton } from '../components/Skeleton';
import { LEVEL_UI, RuleCard } from '../components/RuleCard';
import { errorMessage, useToast } from '../components/Toast';
import { Badge, Button, Card, CountUp, EmptyState, PageHeader, ProgressBar, PnlAmount, Select, SectionTitle, buttonStyles, cn } from '../components/ui';

/** Tuile de la ligne KPI : le libellé se retourne sur deux lignes au lieu d’être tronqué (il reste lisible en entier). */
function Kpi({ label, value, sub, valueClass }: { label: string; value: ReactNode; sub?: ReactNode; valueClass?: string }) {
  return (
    <div className="min-w-0 bg-surface p-4 md:p-5">
      <div className="min-h-[2lh] text-[13px] leading-snug text-muted">{label}</div>
      <div className={cn('mt-1.5 whitespace-nowrap text-xl font-semibold tabular-nums tracking-tight 2xl:text-2xl', valueClass ?? 'text-fg')}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs leading-snug text-muted">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { mode } = useAuth();
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: trades, isLoading: loadingTrades } = useTrades();
  const { data: profile } = useProfile();
  const [scope, setScope] = useState('all');

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
  const recent = sortByTradeTime(scopeTrades).slice(-6).reverse();
  const planTracked = scopeTrades.filter((t) => t.plan_respected !== null).length;
  const planYes = scopeTrades.filter((t) => t.plan_respected === true).length;
  const days = dailyBars(scopeTrades, tz);
  const daily = dailyMap(scopeTrades, tz);
  const bestDay = days.reduce<DayBar | null>((best, d) => (best === null || d.pnl > best.pnl ? d : best), null);
  const lastDay = days.at(-1)?.date ?? dayKey(new Date(), tz);
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

      {/* 1. Ligne KPI : chiffres clés en police sans, à chiffres tabulaires */}
      <section
        aria-label="Indicateurs clés"
        className="stagger grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card min-[768px]:grid-cols-3 min-[1400px]:grid-cols-6"
      >
        <Kpi
          label="P&L net"
          value={
            <CountUp
              value={stats.netPnl}
              format={(v) => formatMoney(v, currency, true)}
              className={cn('block', stats.count > 0 ? signClass(stats.netPnl) : 'text-muted')}
            />
          }
          sub={`Brut ${formatMoney(stats.grossPnl, currency, true)} · frais ${formatMoney(stats.fees, currency)}`}
        />
        <Kpi
          label="Taux de réussite"
          value={formatPercent(stats.winRate, 0)}
          sub={`${stats.wins} gagnant(s) · ${stats.losses} perdant(s)`}
        />
        <Kpi label="Profit factor" value={formatProfitFactor(stats.profitFactor)} sub="Gains bruts ÷ pertes brutes" />
        <Kpi
          label="Espérance / trade"
          value={<PnlAmount value={stats.expectancy} currency={currency} />}
          sub={stats.avgR === null ? 'R : risque non renseigné' : `soit ${formatR(stats.avgR)} par trade`}
        />
        <Kpi
          label="Drawdown réalisé (historique)"
          value={formatMoney(stats.maxDrawdown, currency)}
          valueClass={stats.maxDrawdown > 0 ? 'text-loss' : undefined}
          sub="Plus forte baisse depuis le départ"
        />
        <Kpi
          label="Meilleur jour"
          value={bestDay ? <PnlAmount value={bestDay.pnl} currency={currency} /> : '—'}
          sub={bestDay ? `${bestDay.label} · ${bestDay.count} trade(s)` : 'Aucune journée'}
        />
      </section>

      {/* 2. Bloc principal : courbe d’équité et drawdown synchronisés ; à droite, respect du plan et derniers trades */}
      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <EquityPanel key={scope} trades={scopeTrades} startingBalance={startingBalance} currency={currency} rule={rule} />
        </div>

        <div className="stagger flex min-w-0 flex-col gap-4 lg:col-span-4">
          <Card className="p-5">
            <div className="text-[13px] text-muted">Respect du plan</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-3xl font-semibold tabular-nums tracking-tight text-fg">
                {stats.planRespectedRate === null ? '—' : formatPercent(stats.planRespectedRate, 0)}
              </span>
              <span className="text-xs text-muted">des trades renseignés</span>
            </div>
            <ProgressBar ratio={(stats.planRespectedRate ?? 0) / 100} className="bg-accent" track="mt-4 w-full" />
            <div className="mt-3 text-xs text-muted">
              {planYes} trade(s) dans le plan sur {planTracked} renseigné(s)
            </div>
          </Card>

          <Card className="flex-1 p-5">
            <SectionTitle
              title="Derniers trades"
              action={
                <Link to="/trades" className="text-xs font-medium text-accent transition-colors hover:text-accent-hi">
                  Tout voir
                </Link>
              }
            />
            {recent.length === 0 ? (
              <p className="text-sm text-muted">Aucun trade sur ce périmètre pour l’instant.</p>
            ) : (
              <ul className="-my-2 divide-y divide-line">
                {recent.map((t) => {
                  const account = accountById.get(t.account_id);
                  return (
                    <li key={t.id}>
                      <Link
                        to={`/trades/${t.id}`}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-fg">{t.instrument}</span>
                            <Badge tone={t.direction === 'long' ? 'good' : 'bad'}>{t.direction === 'long' ? 'Achat' : 'Vente'}</Badge>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {formatDateTime(t.opened_at)} · {account?.name ?? '—'}
                          </span>
                        </span>
                        <PnlAmount value={t.net_pnl} currency={account?.currency ?? DEFAULT_CURRENCY} className="shrink-0 font-semibold" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* 3. Calendrier puis P&L par jour */}
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <ChartFrame title="Calendrier" description="Un jour = un jour de trading. Clique un jour pour voir ses trades.">
            <CalendarHeatmap
              key={scope}
              daily={daily}
              initialMonth={lastDay.slice(0, 7)}
              currency={currency}
              onSelectDay={(date) => navigate(`/trades?from=${date}&to=${date}`)}
            />
          </ChartFrame>
        </div>
        <div className="min-w-0 lg:col-span-7">
          <DailyPnlChart key={`daily-${scope}`} bars={days} currency={currency} />
        </div>
      </div>

      {/* 4. Règles prop firm : marge restante en $ */}
      {reports.length > 0 && (
        <section className="mt-8">
          <SectionTitle
            title="Règles & limites"
            description="Perte journalière, drawdown, objectif et cohérence de tes comptes à règles."
          />
          <div className={cn('grid gap-4', reports.length > 1 && 'md:grid-cols-2')}>
            {reports.map(({ account, report }) => (
              <RuleCard key={account.id} account={account} report={report} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
