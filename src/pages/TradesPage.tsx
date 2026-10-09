import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Check, Download, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useAccounts, useRefresh, useRepo, useTrades } from '../data/hooks';
import { computeStats, sortByTradeTime, tradeTime } from '../lib/metrics';
import { dayKey, formatDateTime, formatPercent, formatProfitFactor, formatR } from '../lib/format';
import { tradesToCsv } from '../lib/csv';
import { errorMessage, useToast } from '../components/Toast';
import { Badge, Button, Card, EmptyState, Input, Loading, PageHeader, Select, Segmented, Stat, StatStrip, buttonStyles, PnlAmount } from '../components/ui';

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

type Outcome = 'all' | 'win' | 'loss' | 'be';

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'win', label: 'Gagnants' },
  { value: 'loss', label: 'Perdants' },
  { value: 'be', label: 'Break-even' },
];

export default function TradesPage() {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: trades, isLoading: loadingTrades } = useTrades();
  const [accountFilter, setAccountFilter] = useState('all');
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const remove = useMutation({
    mutationFn: (ids: string[]) => repo.deleteTrades(ids),
    onSuccess: async (_data, ids) => {
      await refresh();
      setSelected(new Set());
      toast.show(`${ids.length} trade(s) supprimé(s)`);
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  if (loadingAccounts || loadingTrades) return <Loading />;

  const accountList = accounts ?? [];
  const accountById = new Map(accountList.map((a) => [a.id, a]));
  const q = query.trim().toLowerCase();

  const rows = sortByTradeTime(trades ?? [])
    .reverse()
    .filter((t) => {
      if (accountFilter !== 'all' && t.account_id !== accountFilter) return false;
      if (outcome === 'win' && !(t.net_pnl > 0)) return false;
      if (outcome === 'loss' && !(t.net_pnl < 0)) return false;
      if (outcome === 'be' && t.net_pnl !== 0) return false;
      if (q && !`${t.instrument} ${t.setup ?? ''} ${t.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      const day = dayKey(tradeTime(t), BROWSER_TZ);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });

  const stats = computeStats(rows, BROWSER_TZ);
  const allSelected = rows.length > 0 && rows.every((t) => selected.has(t.id));
  const currencies = [...new Set(rows.map((t) => accountById.get(t.account_id)?.currency ?? 'USD'))];
  const currency = currencies.length === 1 ? currencies[0] : 'USD';
  const filtered = accountFilter !== 'all' || outcome !== 'all' || q !== '' || from !== '' || to !== '';

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((t) => t.id)));

  const resetFilters = () => {
    setAccountFilter('all');
    setOutcome('all');
    setQuery('');
    setFrom('');
    setTo('');
  };

  const exportCsv = () => {
    const csv = tradesToCsv(rows, new Map(accountList.map((a) => [a.id, a.name])));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Trades"
        description={`${rows.length} trade(s) affiché(s) sur ${trades?.length ?? 0}`}
        actions={
          <>
            <Button onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4" aria-hidden />
              Exporter
            </Button>
            {selected.size > 0 && (
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Supprimer ${selected.size} trade(s) ? Action irréversible.`)) {
                    remove.mutate([...selected]);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Supprimer ({selected.size})
              </Button>
            )}
            <Link to="/trades/nouveau" className={buttonStyles('primary')}>
              <Plus className="h-4 w-4" aria-hidden />
              Nouveau trade
            </Link>
          </>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} aria-label="Compte">
              <option value="all">Tous les comptes</option>
              {accountList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="relative md:col-span-5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              className="pl-10"
              placeholder="Rechercher un instrument, un setup, un tag…"
              aria-label="Rechercher"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Input type="date" aria-label="Du" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Input type="date" aria-label="Au" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Segmented id="outcome" label="Résultat" options={OUTCOMES} value={outcome} onChange={setOutcome} />
          {filtered && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </Card>

      <StatStrip className="mb-6">
        <Stat label="P&L net" value={<PnlAmount value={stats.netPnl} currency={currency} />} sub={`${stats.count} trade(s)`} />
        <Stat
          label="Réussite"
          value={formatPercent(stats.winRate)}
          sub={`${stats.wins} G · ${stats.losses} P · ${stats.breakeven} BE`}
        />
        <Stat label="Profit factor" value={formatProfitFactor(stats.profitFactor)} />
        <Stat label="R moyen" value={formatR(stats.avgR)} />
      </StatStrip>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Plus className="h-6 w-6" aria-hidden />}
          title="Aucun trade à afficher"
          description="Modifie les filtres ou ajoute un nouveau trade."
          action={
            <Link to="/trades/nouveau" className={buttonStyles('primary')}>
              Ajouter un trade
            </Link>
          }
        />
      ) : (
        <>
          {/* Tableau (ordinateur) */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-line bg-surface-2/60 text-left text-xs text-muted">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Tout sélectionner"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 accent-accent"
                      />
                    </th>
                    <th className="px-3 py-3 font-medium">Ouverture</th>
                    <th className="px-3 py-3 font-medium">Compte</th>
                    <th className="px-3 py-3 font-medium">Instrument</th>
                    <th className="px-3 py-3 font-medium">Sens</th>
                    <th className="px-3 py-3 text-right font-medium">Taille</th>
                    <th className="px-3 py-3 text-right font-medium">P&amp;L net</th>
                    <th className="px-3 py-3 text-right font-medium">R</th>
                    <th className="px-3 py-3 font-medium">Setup</th>
                    <th className="px-3 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((t) => {
                    const account = accountById.get(t.account_id);
                    return (
                      <tr key={t.id} className="transition-colors hover:bg-surface-2/60">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Sélectionner le trade ${t.instrument}`}
                            checked={selected.has(t.id)}
                            onChange={() => toggle(t.id)}
                            className="h-4 w-4 accent-accent"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-fg-2">{formatDateTime(t.opened_at)}</td>
                        <td className="max-w-40 truncate px-3 py-3 text-muted">{account?.name ?? '—'}</td>
                        <td className="px-3 py-3 font-medium text-fg">{t.instrument}</td>
                        <td className="px-3 py-3">
                          <Badge tone={t.direction === 'long' ? 'good' : 'bad'}>{t.direction === 'long' ? 'Achat' : 'Vente'}</Badge>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-fg-2">{t.size ?? '—'}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">
                          <PnlAmount value={t.net_pnl} currency={account?.currency ?? 'USD'} />
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-fg-2">
                          {t.risk_amount ? formatR(t.net_pnl / t.risk_amount) : '—'}
                        </td>
                        <td className="max-w-36 truncate px-3 py-3 text-muted">{t.setup ?? '—'}</td>
                        <td className="px-3 py-3">
                          {t.plan_respected === null ? (
                            <span className="text-muted">—</span>
                          ) : t.plan_respected ? (
                            <span className="inline-flex items-center gap-1 text-gain">
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Oui
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-loss">
                              <X className="h-3.5 w-3.5" aria-hidden />
                              Non
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/trades/${t.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            Modifier
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Liste (mobile) */}
          <ul className="space-y-2 md:hidden">
            {rows.map((t) => {
              const account = accountById.get(t.account_id);
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner le trade ${t.instrument}`}
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="h-5 w-5 shrink-0 accent-accent"
                  />
                  <Link to={`/trades/${t.id}`} className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-fg">{t.instrument}</span>
                      <Badge tone={t.direction === 'long' ? 'good' : 'bad'}>{t.direction === 'long' ? 'Achat' : 'Vente'}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {formatDateTime(t.opened_at)} · {account?.name ?? '—'}
                      {t.setup ? ` · ${t.setup}` : ''}
                    </span>
                  </Link>
                  <PnlAmount value={t.net_pnl} currency={account?.currency ?? 'USD'} className="shrink-0 text-right font-semibold" />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
