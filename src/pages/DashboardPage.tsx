import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useAccounts, useProfile, useRefresh, useRepo, useTrades } from '../data/hooks';
import { computeStats, equitySeries, sortByTradeTime } from '../lib/metrics';
import { evaluateAccount, hasAnyRule } from '../lib/rules';
import { formatDateTime, formatMoney, formatNumber, formatPercent, formatProfitFactor, formatR, signClass, pnlGlyph } from '../lib/format';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from '../lib/constants';
import { loadDemoData } from '../lib/demoData';
import { LEVEL_UI, RuleCard } from '../components/RuleCard';
import { errorMessage, useToast } from '../components/Toast';
import { Badge, Button, Card, CountUp, EmptyState, Loading, PageHeader, ProgressBar, Ring, Select, SectionTitle, Stat, StatStrip, buttonStyles, cn, PnlAmount } from '../components/ui';

const AXIS = { fill: '#7d8899', fontSize: 11 };
const TOOLTIP = {
  background: '#0d1118',
  border: '1px solid #243043',
  borderRadius: 12,
  fontSize: 12,
  boxShadow: '0 16px 40px -12px rgb(0 0 0 / 0.7)',
};

export default function DashboardPage() {
  const { mode } = useAuth();
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
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

  if (loadingAccounts || loadingTrades) return <Loading />;

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
  const series = equitySeries(scopeTrades, startingBalance);
  const recent = sortByTradeTime(scopeTrades).slice(-8).reverse();
  const planTracked = scopeTrades.filter((t) => t.plan_respected !== null).length;
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
          <>
            <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Compte" className="min-w-52">
              <option value="all">Tous les comptes actifs</option>
              {accountList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>

          </>
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

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="p-6 md:p-7 lg:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13px] text-muted">P&amp;L net</div>
              <div className="mt-3 flex items-baseline gap-3">
                {stats.count > 0 && pnlGlyph(stats.netPnl) && (
                  <span aria-hidden className={cn('font-serif text-3xl md:text-4xl', signClass(stats.netPnl))}>
                    {pnlGlyph(stats.netPnl)}
                  </span>
                )}
                <CountUp
                  value={stats.netPnl}
                  format={(v) => formatMoney(v, currency, true)}
                  className={cn(
                    'block font-serif text-5xl leading-none tracking-tight md:text-6xl',
                    stats.count > 0 ? signClass(stats.netPnl) : 'text-muted',
                  )}
                />
              </div>
              <div className="mt-3 text-sm text-muted">
                Brut {formatMoney(stats.grossPnl, currency, true)} · frais {formatMoney(stats.fees, currency)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{stats.count} trade(s)</Badge>
              <Badge>{stats.tradingDays} jour(s) tradé(s)</Badge>
            </div>
          </div>

          <div className="mt-7 flex items-center justify-between gap-3 text-[13px]">
            <span className="font-medium text-fg-2">Courbe d’équité</span>
            <span className="text-muted">Trade par trade, en réalisé</span>
          </div>
          <div className="mt-3 h-64 w-full md:h-72">
            {scopeTrades.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-line-2 text-sm text-muted">
                La courbe d’équité apparaîtra après ton premier trade.
              </div>
            ) : (
              <div className="chart-glow h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f2b84b" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#f2b84b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1b2433" strokeDasharray="2 6" vertical={false} />
                    <XAxis dataKey="n" tick={AXIS} tickLine={false} axisLine={false} minTickGap={28} />
                    <YAxis
                      tick={AXIS}
                      tickLine={false}
                      axisLine={false}
                      width={80}
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => formatNumber(v, 0)}
                    />
                    <Tooltip
                      cursor={{ stroke: '#334056', strokeDasharray: '3 3' }}
                      contentStyle={TOOLTIP}
                      labelStyle={{ color: '#8491a4' }}
                      itemStyle={{ color: '#eef2f8' }}
                      labelFormatter={(n) => (n === 0 ? 'Solde initial' : `Trade n°${n}`)}
                      formatter={(value) => [formatMoney(Number(value), currency), 'Équité']}
                    />
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="#f2b84b"
                      strokeWidth={2.25}
                      fill="url(#equityFill)"
                      activeDot={{ r: 5, fill: '#f2b84b', stroke: '#0d1118', strokeWidth: 3 }}
                      animationDuration={1400}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
          <Card className="flex items-center gap-6 p-6">
            <Ring value={stats.winRate / 100} size={116} stroke={9} color="var(--color-gain)">
              <span className="font-serif text-[30px] leading-none tabular-nums text-fg">{formatPercent(stats.winRate, 0)}</span>
            </Ring>
            <div className="min-w-0">
              <div className="text-[13px] text-muted">Taux de réussite</div>
              <div className="mt-2 space-y-0.5 text-sm">
                <div className="text-gain">{stats.wins} gagnant(s)</div>
                <div className="text-loss">{stats.losses} perdant(s)</div>
              </div>
              <div className="mt-1 text-xs text-muted">{stats.breakeven} break-even</div>
            </div>
          </Card>

          <Card className="flex flex-col justify-between gap-5 p-6">
            <div>
              <div className="text-[13px] text-muted">Respect du plan</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-4xl leading-none tabular-nums text-fg">
                  {stats.planRespectedRate === null ? '—' : formatPercent(stats.planRespectedRate, 0)}
                </span>
                <span className="text-xs text-muted">des trades renseignés</span>
              </div>
            </div>
            <ProgressBar ratio={(stats.planRespectedRate ?? 0) / 100} className="bg-accent" />
            <div className="text-xs text-muted">
              {planTracked} trade(s) avec plan renseigné sur {stats.count}
            </div>
          </Card>
        </div>
      </div>

      <StatStrip className="mt-4">
        <Stat label="Profit factor" value={formatProfitFactor(stats.profitFactor)} sub="Gains bruts ÷ pertes brutes" />
        <Stat
          label="Espérance / trade"
          value={<PnlAmount value={stats.expectancy} currency={currency} />}
          sub={stats.avgR === null ? `Gain moyen ${formatMoney(stats.avgWin, currency)}` : `R moyen ${formatR(stats.avgR)}`}
        />
        <Stat
          label="Drawdown max"
          value={formatMoney(stats.maxDrawdown, currency)}
          valueClass={stats.maxDrawdown > 0 ? 'text-loss' : undefined}
          sub="Plus forte baisse réalisée"
        />
        <Stat
          label="Meilleur trade"
          value={<PnlAmount value={stats.bestTrade} currency={currency} />}
          sub={`Pire : ${formatMoney(stats.worstTrade, currency, true)}`}
        />
      </StatStrip>

      <div className="mt-8 grid gap-4 lg:grid-cols-12">
        {reports.length > 0 && (
          <section className="lg:col-span-8">
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

        <Card className={cn('p-6', reports.length > 0 ? 'lg:col-span-4' : 'lg:col-span-12')}>
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
    </>
  );
}
