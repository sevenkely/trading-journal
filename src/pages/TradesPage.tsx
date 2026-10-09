import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Bookmark, Check, ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, SlidersHorizontal, Trash2, X, Zap } from 'lucide-react';
import { useAccounts, useTrades } from '../data/hooks';
import { computeStats } from '../lib/metrics';
import { formatDateTime, formatPercent, formatProfitFactor, formatR } from '../lib/format';
import { tradesToCsv } from '../lib/csv';
import { useUndoableTradeDelete } from '../data/undoableDelete';
import { useHiddenIds } from '../lib/pendingDeletion';
import { TradeDrawer } from '../components/TradeDrawer';
import { QuickTradeSheet } from '../components/QuickTradeSheet';
import { Badge, Button, Card, EmptyState, Input, Loading, PageHeader, PnlAmount, Select, Stat, StatStrip, buttonStyles, cn } from '../components/ui';
import {
  COLUMN_LABELS,
  DEFAULT_QUERY,
  OPTIONAL_COLUMNS,
  PAGE_SIZE,
  filterTrades,
  paginate,
  parseColumns,
  parseTradeQuery,
  parseViews,
  rMultiple,
  sortTrades,
  tradeQueryString,
  writeTradeQuery,
  addView,
  removeView,
  type OptionalColumn,
  type Outcome,
  type PlanFilter,
  type SavedView,
  type Side,
  type SortDir,
  type SortKey,
  type TradeQuery,
} from '../lib/tradeQuery';

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const COMPACT_KEY = 'tj-trades-compact';
const COLUMNS_KEY = 'tj-trades-columns';
const VIEWS_KEY = 'tj-trades-views';

/** Premier sens de tri appliqué à une colonne (le plus utile d’abord). */
const FIRST_DIR: Record<SortKey, SortDir> = { opened: 'desc', instrument: 'asc', size: 'desc', pnl: 'desc', r: 'desc', setup: 'asc' };

const OUTCOME_CHIPS: { value: Outcome; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'win', label: 'Gagnants' },
  { value: 'loss', label: 'Perdants' },
  { value: 'be', label: 'Break-even' },
];
const SIDE_CHIPS: { value: Side; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'long', label: 'Achat' },
  { value: 'short', label: 'Vente' },
];
const PLAN_CHIPS: { value: PlanFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'yes', label: 'Plan suivi' },
  { value: 'no', label: 'Plan non suivi' },
];

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : la préférence vaut pour cette session seulement.
  }
}

/** Groupe de chips (boutons à état) : cibles tactiles de 40 px sur mobile. */
function FilterChips<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted">{label}</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-10 rounded-full border px-3 text-xs font-medium transition-colors md:min-h-8',
            value === option.value ? 'border-accent/40 bg-accent/10 text-accent-hi' : 'border-line-2 text-muted hover:text-fg-2',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** En-tête triable : aria-sort, bouton au clic, icône de sens. */
function SortHeader({ label, sortKey, query, onSort, align = 'left' }: { label: string; sortKey: SortKey; query: TradeQuery; onSort: (key: SortKey) => void; align?: 'left' | 'right' }) {
  const active = query.sort === sortKey;
  const Icon = !active ? ArrowUpDown : query.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-3 py-3 font-medium', align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('inline-flex items-center gap-1 rounded transition-colors hover:text-fg', active && 'text-fg')}
      >
        {label}
        <Icon className="h-3 w-3" aria-hidden />
      </button>
    </th>
  );
}

function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  return (
    <nav aria-label="Pages des trades" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted">
        Page {page} sur {pageCount}
      </span>
      <div className="flex gap-2">
        <button type="button" className={buttonStyles('secondary', 'sm')} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Précédent
        </button>
        <button type="button" className={buttonStyles('secondary', 'sm')} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Suivant
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}

export default function TradesPage() {
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: trades, isLoading: loadingTrades } = useTrades();
  // Filtres, tri et page vivent dans l’URL : un lien (ex. depuis le calendrier) ou une vue reproduit le même tableau
  const [params, setParams] = useSearchParams();
  const hidden = useHiddenIds();
  const removeTrades = useUndoableTradeDelete();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compact, setCompact] = useState(() => readStorage(COMPACT_KEY) === '1');
  const [columns, setColumns] = useState<OptionalColumn[]>(() => parseColumns(readStorage(COLUMNS_KEY)));
  const [views, setViews] = useState<SavedView[]>(() => parseViews(readStorage(VIEWS_KEY)));
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [viewNameOpen, setViewNameOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);

  const query = parseTradeQuery(params);
  const openId = params.get('trade');

  /** Modifie la requête ; toute modification (sauf la page) revient à la première page. */
  const setQuery = (patch: Partial<TradeQuery>) => setParams((prev) => writeTradeQuery(prev, { ...query, page: 1, ...patch }), { replace: true });

  if (loadingAccounts || loadingTrades) return <Loading />;

  const accountList = accounts ?? [];
  const accountById = new Map(accountList.map((a) => [a.id, a]));
  const sorted = sortTrades(filterTrades(trades ?? [], query, BROWSER_TZ, hidden), query.sort, query.dir);
  const { page, pageCount, start, end } = paginate(sorted.length, query.page, PAGE_SIZE);
  const pageRows = sorted.slice(start, end);
  const stats = computeStats(sorted, BROWSER_TZ);
  const currencies = [...new Set(sorted.map((t) => accountById.get(t.account_id)?.currency ?? 'USD'))];
  const currency = currencies.length === 1 ? currencies[0] : 'USD';
  const filtersActive = query.account !== DEFAULT_QUERY.account || query.outcome !== 'all' || query.side !== 'all' || query.plan !== 'all' || query.q !== '' || query.from !== '' || query.to !== '';
  const show = (column: OptionalColumn) => columns.includes(column);
  const cell = compact ? 'px-3 py-1.5' : 'px-3 py-3';
  const firstCell = compact ? 'px-4 py-1.5' : 'px-4 py-3';

  const openIndex = openId ? sorted.findIndex((t) => t.id === openId) : -1;
  const openTradeData = openId ? (trades ?? []).find((t) => t.id === openId) ?? null : null;
  const setOpenTrade = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('trade', id);
        else next.delete('trade');
        return next;
      },
      { replace: true },
    );
  const goToOpenTrade = (offset: number) => {
    const target = sorted[openIndex + offset];
    if (target) setOpenTrade(target.id);
  };

  const sortBy = (key: SortKey) => {
    if (query.sort === key) setQuery({ dir: query.dir === 'asc' ? 'desc' : 'asc' });
    else setQuery({ sort: key, dir: FIRST_DIR[key] });
  };

  const allPageSelected = pageRows.length > 0 && pageRows.every((t) => selected.has(t.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of pageRows) {
        if (allPageSelected) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });

  const toggleCompact = () => {
    const next = !compact;
    setCompact(next);
    writeStorage(COMPACT_KEY, next ? '1' : '0');
  };

  const toggleColumn = (column: OptionalColumn) => {
    const next = columns.includes(column) ? columns.filter((c) => c !== column) : [...columns, column];
    setColumns(next);
    writeStorage(COLUMNS_KEY, JSON.stringify(next));
  };

  const saveView = () => {
    const next = addView(views, viewName, tradeQueryString(query));
    if (next === views) return;
    setViews(next);
    writeStorage(VIEWS_KEY, JSON.stringify(next));
    setViewName('');
    setViewNameOpen(false);
  };

  const deleteView = (id: string) => {
    const next = removeView(views, id);
    setViews(next);
    writeStorage(VIEWS_KEY, JSON.stringify(next));
  };

  const applyView = (view: SavedView) => setParams(new URLSearchParams(view.query), { replace: true });

  const exportCsv = () => {
    const csv = tradesToCsv(sorted, new Map(accountList.map((a) => [a.id, a.name])));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeAccount = accountList.find((a) => a.status !== 'archived') ?? accountList[0];
  const quickAccountId = accountById.has(query.account) ? query.account : (activeAccount?.id ?? '');

  const emptyTable: ReactNode = (
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
  );

  return (
    <>
      <PageHeader
        title="Trades"
        description={`${sorted.length} trade(s) affiché(s) sur ${trades?.length ?? 0}`}
        actions={
          <>
            {accountList.length > 0 && (
              <Button onClick={() => setQuickOpen(true)}>
                <Zap className="h-4 w-4" aria-hidden />
                Ajout rapide
              </Button>
            )}
            <Button onClick={exportCsv} disabled={sorted.length === 0}>
              <Download className="h-4 w-4" aria-hidden />
              Exporter
            </Button>
            {selected.size > 0 && (
              <Button
                variant="danger"
                onClick={() => {
                  removeTrades([...selected], `${selected.size} trade(s) supprimé(s)`);
                  setSelected(new Set());
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

      <Card className="mb-5 space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <Select value={query.account} onChange={(e) => setQuery({ account: e.target.value })} aria-label="Compte">
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
              value={query.q}
              onChange={(e) => setQuery({ q: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Input type="date" lang="fr-FR" aria-label="Du" value={query.from} onChange={(e) => setQuery({ from: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Input type="date" lang="fr-FR" aria-label="Au" value={query.to} onChange={(e) => setQuery({ to: e.target.value })} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FilterChips label="Résultat" options={OUTCOME_CHIPS} value={query.outcome} onChange={(outcome) => setQuery({ outcome })} />
          <FilterChips label="Sens" options={SIDE_CHIPS} value={query.side} onChange={(side) => setQuery({ side })} />
          <FilterChips label="Plan" options={PLAN_CHIPS} value={query.plan} onChange={(plan) => setQuery({ plan })} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2" aria-label="Vues enregistrées">
            <span className="text-xs text-muted">Vues</span>
            {views.map((view) => (
              <span key={view.id} className="inline-flex items-center rounded-full border border-line-2 bg-surface-2/60">
                <button type="button" onClick={() => applyView(view)} className="min-h-9 px-3 text-xs font-medium text-fg-2 transition-colors hover:text-fg md:min-h-8">
                  {view.name}
                </button>
                <button
                  type="button"
                  aria-label={`Supprimer la vue ${view.name}`}
                  onClick={() => deleteView(view.id)}
                  className="grid min-h-9 min-w-8 place-items-center pr-2 text-muted transition-colors hover:text-loss md:min-h-8"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
            {viewNameOpen ? (
              <form
                className="inline-flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveView();
                }}
              >
                <Input
                  aria-label="Nom de la vue"
                  placeholder="Nom de la vue"
                  value={viewName}
                  maxLength={40}
                  onChange={(e) => setViewName(e.target.value)}
                  className="h-9 w-44 text-xs"
                  autoFocus
                />
                <button type="submit" className={buttonStyles('primary', 'sm')} disabled={!viewName.trim()}>
                  Enregistrer
                </button>
                <button type="button" className={buttonStyles('ghost', 'sm')} onClick={() => setViewNameOpen(false)}>
                  Annuler
                </button>
              </form>
            ) : (
              <button type="button" className={buttonStyles('ghost', 'sm')} onClick={() => setViewNameOpen(true)} disabled={!filtersActive && query.sort === DEFAULT_QUERY.sort && query.dir === DEFAULT_QUERY.dir}>
                <Bookmark className="h-3.5 w-3.5" aria-hidden />
                Enregistrer la vue
              </button>
            )}
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={() => setQuery({ account: 'all', outcome: 'all', side: 'all', plan: 'all', q: '', from: '', to: '' })}
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
        <Stat label="Réussite" value={formatPercent(stats.winRate)} sub={`${stats.wins} G · ${stats.losses} P · ${stats.breakeven} BE`} />
        <Stat label="Profit factor" value={formatProfitFactor(stats.profitFactor)} />
        <Stat label="R moyen" value={formatR(stats.avgR)} />
      </StatStrip>

      {sorted.length === 0 ? (
        emptyTable
      ) : (
        <>
          {/* Tableau (ordinateur) : en-tête collant, défilement dans le tableau */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-card md:block">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <p className="text-xs text-muted" aria-live="off">
                Lignes {start + 1} à {end} sur {sorted.length}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" aria-pressed={compact} onClick={toggleCompact} className={buttonStyles('secondary', 'sm')}>
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                  Mode compact
                </button>
                <div className="relative">
                  <button
                    type="button"
                    aria-expanded={columnsOpen}
                    aria-controls="trades-columns"
                    onClick={() => setColumnsOpen((open) => !open)}
                    className={buttonStyles('secondary', 'sm')}
                  >
                    Colonnes
                  </button>
                  {columnsOpen && (
                    <div
                      id="trades-columns"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setColumnsOpen(false);
                      }}
                      className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-line-2 bg-surface p-2 shadow-overlay"
                    >
                      {OPTIONAL_COLUMNS.map((column) => (
                        <label key={column} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-fg-2 hover:bg-surface-2">
                          <input type="checkbox" className="h-4 w-4 accent-accent" checked={show(column)} onChange={() => toggleColumn(column)} />
                          {COLUMN_LABELS[column]}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="max-h-[calc(100dvh-20rem)] overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">Trades, triables par colonne. Une ligne ouvre son détail.</caption>
                <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="w-12 border-b border-line px-4 py-3">
                      <input type="checkbox" aria-label="Sélectionner les trades de cette page" checked={allPageSelected} onChange={togglePage} className="h-4 w-4 accent-accent" />
                    </th>
                    <SortHeader label="Ouverture" sortKey="opened" query={query} onSort={sortBy} />
                    {show('account') && <th scope="col" className="border-b border-line px-3 py-3 font-medium">Compte</th>}
                    <SortHeader label="Instrument" sortKey="instrument" query={query} onSort={sortBy} />
                    {show('side') && <th scope="col" className="border-b border-line px-3 py-3 font-medium">Sens</th>}
                    {show('size') && <SortHeader label="Taille" sortKey="size" query={query} onSort={sortBy} align="right" />}
                    <SortHeader label="P&L net" sortKey="pnl" query={query} onSort={sortBy} align="right" />
                    {show('r') && <SortHeader label="R" sortKey="r" query={query} onSort={sortBy} align="right" />}
                    {show('setup') && <SortHeader label="Setup" sortKey="setup" query={query} onSort={sortBy} />}
                    {show('plan') && <th scope="col" className="border-b border-line px-3 py-3 font-medium">Plan</th>}
                    <th scope="col" className="border-b border-line px-4 py-3 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pageRows.map((t) => {
                    const account = accountById.get(t.account_id);
                    const r = rMultiple(t);
                    return (
                      <tr
                        key={t.id}
                        className="cursor-pointer transition-colors hover:bg-surface-2/60"
                        onClick={(event) => {
                          // Les cases, boutons et liens gardent leur propre action
                          if (!(event.target as HTMLElement).closest('a, button, input, label')) setOpenTrade(t.id);
                        }}
                      >
                        <td className={firstCell}>
                          <input
                            type="checkbox"
                            aria-label={`Sélectionner le trade ${t.instrument} du ${formatDateTime(t.opened_at)}`}
                            checked={selected.has(t.id)}
                            onChange={() => toggle(t.id)}
                            className="h-4 w-4 accent-accent"
                          />
                        </td>
                        <td className={cn('whitespace-nowrap text-fg-2', cell)}>{formatDateTime(t.opened_at)}</td>
                        {show('account') && <td className={cn('max-w-40 truncate text-muted', cell)}>{account?.name ?? '—'}</td>}
                        <td className={cell}>
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            aria-label={`Voir le détail du trade ${t.instrument}, ${formatDateTime(t.opened_at)}`}
                            onClick={() => setOpenTrade(t.id)}
                            className="rounded font-medium text-fg transition-colors hover:text-accent"
                          >
                            {t.instrument}
                          </button>
                        </td>
                        {show('side') && (
                          <td className={cell}>
                            <Badge tone={t.direction === 'long' ? 'good' : 'bad'}>{t.direction === 'long' ? 'Achat' : 'Vente'}</Badge>
                          </td>
                        )}
                        {show('size') && <td className={cn('text-right tabular-nums text-fg-2', cell)}>{t.size ?? '—'}</td>}
                        <td className={cn('text-right font-semibold tabular-nums', cell)}>
                          <PnlAmount value={t.net_pnl} currency={account?.currency ?? 'USD'} />
                        </td>
                        {show('r') && <td className={cn('whitespace-nowrap text-right tabular-nums text-fg-2', cell)}>{r === null ? '—' : formatR(r)}</td>}
                        {show('setup') && <td className={cn('max-w-36 truncate text-muted', cell)}>{t.setup ?? '—'}</td>}
                        {show('plan') && (
                          <td className={cell}>
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
                        )}
                        <td className={cn('px-4 text-right', compact ? 'py-1' : 'py-2')}>
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
                <tfoot className="border-t border-line-2 bg-surface-2/60 text-sm font-semibold">
                  <tr>
                    <td className={firstCell} />
                    <th scope="row" className={cn('text-left font-semibold text-fg', cell)}>
                      Total · {stats.count} trade(s)
                    </th>
                    {show('account') && <td className={cell} />}
                    <td className={cell} />
                    {show('side') && <td className={cell} />}
                    {show('size') && <td className={cell} />}
                    <td className={cn('text-right', cell)}>
                      <PnlAmount value={stats.netPnl} currency={currency} />
                    </td>
                    {show('r') && <td className={cn('whitespace-nowrap text-right tabular-nums text-fg-2', cell)} title="R moyen des trades avec risque renseigné">{formatR(stats.avgR)}</td>}
                    {show('setup') && <td className={cell} />}
                    {show('plan') && <td className={cell} />}
                    <td className={cell} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Liste (mobile) */}
          <ul className="stagger space-y-2 md:hidden">
            {pageRows.map((t) => {
              const account = accountById.get(t.account_id);
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner le trade ${t.instrument} du ${formatDateTime(t.opened_at)}`}
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="h-5 w-5 shrink-0 accent-accent"
                  />
                  <button type="button" aria-haspopup="dialog" onClick={() => setOpenTrade(t.id)} className="min-w-0 flex-1 rounded-lg text-left">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-fg">{t.instrument}</span>
                      <Badge tone={t.direction === 'long' ? 'good' : 'bad'}>{t.direction === 'long' ? 'Achat' : 'Vente'}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {formatDateTime(t.opened_at)} · {account?.name ?? '—'}
                      {t.setup ? ` · ${t.setup}` : ''}
                    </span>
                  </button>
                  <PnlAmount value={t.net_pnl} currency={account?.currency ?? 'USD'} className="shrink-0 text-right font-semibold" />
                </li>
              );
            })}
          </ul>

          {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPage={(next) => setParams((prev) => writeTradeQuery(prev, { ...query, page: next }), { replace: true })} />}
        </>
      )}

      {quickOpen && accountList.length > 0 && <QuickTradeSheet accounts={accountList} defaultAccountId={quickAccountId} onClose={() => setQuickOpen(false)} />}

      {openTradeData && (
        <TradeDrawer
          trade={openTradeData}
          account={accountById.get(openTradeData.account_id)}
          position={openIndex >= 0 ? { index: openIndex, total: sorted.length } : null}
          onPrev={openIndex > 0 ? () => goToOpenTrade(-1) : null}
          onNext={openIndex >= 0 && openIndex < sorted.length - 1 ? () => goToOpenTrade(1) : null}
          onClose={() => setOpenTrade(null)}
          onDeleted={() => setOpenTrade(null)}
        />
      )}
    </>
  );
}
