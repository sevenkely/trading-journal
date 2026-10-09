import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { useAccounts, useRefresh, useRepo, useTrades } from '../data/hooks';
import { ACCOUNT_KINDS, ACCOUNT_STATUSES } from '../lib/constants';
import { formatDate, formatMoney } from '../lib/format';
import { forecastTarget, type Forecast } from '../lib/forecast';
import { evaluateAccount, resolveAmount } from '../lib/rules';
import type { Account, AccountStatus } from '../lib/types';
import { GaugeRow } from '../components/RuleCard';
import { errorMessage, useToast } from '../components/Toast';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, buttonStyles, PnlAmount, type Tone } from '../components/ui';

function kindLabel(kind: Account['kind']): string {
  return ACCOUNT_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

function statusLabel(status: AccountStatus): string {
  return ACCOUNT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

function statusTone(status: AccountStatus): Tone {
  switch (status) {
    case 'active':
      return 'info';
    case 'passed':
      return 'good';
    case 'failed':
      return 'bad';
    default:
      return 'neutral';
  }
}

/** Résumé court des règles configurées (affiché sous forme de pastilles). */
function ruleSummary(a: Account): string[] {
  const items: string[] = [];
  const daily = resolveAmount(a.daily_loss_amount, a.daily_loss_pct, a.initial_balance);
  if (daily !== null) items.push(`Perte/jour ${formatMoney(daily, a.currency)}`);
  const max = resolveAmount(a.max_loss_amount, a.max_loss_pct, a.initial_balance);
  if (max !== null) items.push(`Max ${a.drawdown_type === 'trailing' ? 'trailing' : 'statique'} ${formatMoney(max, a.currency)}`);
  const target = resolveAmount(a.profit_target_amount, a.profit_target_pct, a.initial_balance);
  if (target !== null) items.push(`Objectif ${formatMoney(target, a.currency)}`);
  if (a.min_trading_days > 0) items.push(`${a.min_trading_days} jour(s) min.`);
  if (a.consistency_pct) items.push(`Cohérence ≤ ${a.consistency_pct} %`);
  return items;
}

/** Estimation d’atteinte de l’objectif, affichée sur la carte du compte. */
function ForecastNote({ forecast, currency }: { forecast: Forecast; currency: string }) {
  if (forecast.status === 'reached') {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-gain">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        Objectif de profit atteint
      </p>
    );
  }
  if (forecast.status === 'estimate' && forecast.date && forecast.tradingDays !== null && forecast.avgDailyPnl !== null) {
    const when = formatDate(`${forecast.date}T12:00:00Z`, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return (
      <div className="rounded-xl border border-line-2 bg-surface-2/60 px-3.5 py-3 text-xs leading-relaxed text-fg-2">
        <div className="text-sm font-medium text-fg">Objectif estimé le {when}</div>
        <div className="mt-0.5">
          Environ {forecast.tradingDays} jour(s) de trading au rythme de {formatMoney(forecast.avgDailyPnl, currency, true)} par jour.
        </div>
        <div className="mt-1 text-muted">Indicatif : suppose que le rythme des {forecast.lookbackDays} derniers jours se maintient.</div>
      </div>
    );
  }
  if (forecast.status === 'negative') {
    return <p className="text-xs leading-relaxed text-muted">Rythme récent négatif : pas de prévision d’objectif pour l’instant.</p>;
  }
  if (forecast.status === 'no-data') {
    return <p className="text-xs leading-relaxed text-muted">Aucun trade sur les {forecast.lookbackDays} derniers jours : pas de prévision.</p>;
  }
  return null;
}

export default function AccountsPage() {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: trades, isLoading: loadingTrades } = useTrades();

  const remove = useMutation({
    mutationFn: (id: string) => repo.deleteAccount(id),
    onSuccess: async () => {
      await refresh();
      toast.show('Compte supprimé');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  if (loadingAccounts || loadingTrades) return <Loading />;

  const accountList = accounts ?? [];
  const tradeList = trades ?? [];
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Comptes"
        description="Comptes personnels, challenges et comptes financés, avec les règles de chaque firme."
        actions={
          <Link to="/comptes/nouveau" className={buttonStyles('primary')}>
            <Plus className="h-4 w-4" aria-hidden />
            Nouveau compte
          </Link>
        }
      />

      {accountList.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" aria-hidden />}
          title="Aucun compte pour l’instant"
          description="Crée ton premier compte pour commencer à suivre tes trades et tes règles."
          action={
            <Link to="/comptes/nouveau" className={buttonStyles('primary')}>
              Créer un compte
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accountList.map((account) => {
            const own = tradeList.filter((t) => t.account_id === account.id);
            const report = evaluateAccount(account, own);
            const forecast = forecastTarget(account, own, now, account.day_timezone || 'UTC');
            const rules = ruleSummary(account);
            const gauges = report.gauges.slice(0, 2);

            return (
              <Card key={account.id} className="flex flex-col gap-5 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-fg" title={account.name}>
                      {account.name}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-muted">
                      {[account.firm, account.platform].filter(Boolean).join(' · ') || 'Aucune firme renseignée'}
                    </div>
                  </div>
                  <Badge tone={statusTone(account.status)}>{statusLabel(account.status)}</Badge>
                </div>

                <div>
                  <div className="text-[13px] text-muted">Équité</div>
                  <div className="mt-1.5 font-serif text-4xl leading-none tabular-nums text-fg">
                    {formatMoney(report.equity, account.currency)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <PnlAmount value={report.netPnl} currency={account.currency} className="font-semibold" />
                    <span className="text-xs text-muted">
                      {kindLabel(account.kind)} · {own.length} trade(s)
                    </span>
                  </div>
                </div>

                {gauges.length > 0 && (
                  <div className="space-y-4">
                    {gauges.map((g) => (
                      <GaugeRow key={g.key} gauge={g} currency={account.currency} />
                    ))}
                  </div>
                )}

                <ForecastNote forecast={forecast} currency={account.currency} />

                {rules.length === 0 && <p className="text-xs leading-relaxed text-muted">Aucune règle de firme : suivi libre de ce compte.</p>}

                {rules.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {rules.map((rule) => (
                      <Badge key={rule}>{rule}</Badge>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-end gap-1 border-t border-line pt-4">
                  <Link to={`/comptes/${account.id}`} className={buttonStyles('ghost', 'sm')}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Modifier
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-loss hover:text-loss"
                    loading={remove.isPending && remove.variables === account.id}
                    onClick={() => {
                      if (window.confirm(`Supprimer le compte « ${account.name} » et tous ses trades ? Action irréversible.`)) {
                        remove.mutate(account.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Supprimer
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
