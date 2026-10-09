import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  ListOrdered,
  Plus,
  Search,
  Settings,
  Upload,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useAccounts, useTrades } from '../data/hooks';
import { DEFAULT_CURRENCY } from '../lib/constants';
import { formatDateTime, formatMoney, signClass } from '../lib/format';
import { sortByTradeTime } from '../lib/metrics';
import type { Account, Trade } from '../lib/types';
import { EASE, SEARCH_SHORTCUT, cn } from './ui';

interface PaletteItem {
  id: string;
  label: string;
  detail?: string;
  to: string;
  icon: LucideIcon;
  value?: { text: string; className: string };
  /** Texte de recherche normalisé (sans accents, en minuscules). */
  search: string;
}

interface PaletteSection {
  title: string;
  items: PaletteItem[];
}

const ACTIONS: Omit<PaletteItem, 'search'>[] = [
  { id: 'new-trade', label: 'Nouveau trade', detail: 'Saisir un trade manuellement', to: '/trades/nouveau', icon: Plus },
  { id: 'new-account', label: 'Nouveau compte', detail: 'Compte perso, challenge ou compte financé', to: '/comptes/nouveau', icon: Wallet },
];

const PAGES: Omit<PaletteItem, 'search'>[] = [
  { id: 'page-dashboard', label: 'Tableau de bord', to: '/', icon: LayoutDashboard },
  { id: 'page-accounts', label: 'Comptes', to: '/comptes', icon: Wallet },
  { id: 'page-trades', label: 'Trades', to: '/trades', icon: ListOrdered },
  { id: 'page-journal', label: 'Journal', to: '/journal', icon: BookOpen },
  { id: 'page-analysis', label: 'Analyse', to: '/analyse', icon: BarChart3 },
  { id: 'page-report', label: 'Bilan de la semaine', to: '/bilan', icon: CalendarDays },
  { id: 'page-import', label: 'Import', to: '/import', icon: Upload },
  { id: 'page-settings', label: 'Paramètres', detail: 'Profil, checklist, sauvegarde', to: '/parametres', icon: Settings },
];

const MAX_TRADE_RESULTS = 8;
const LIST_ID = 'palette-list';

/** Minuscules sans accents, pour que « eur » trouve « EUR » et « Lundi » trouve « lundi ». */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Vrai si chaque mot de la requête apparaît dans le texte (ordre libre). */
function matchesAll(haystack: string, query: string): boolean {
  return query.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

const optionId = (index: number) => `${LIST_ID}-option-${index}`;

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded-md border border-line-2 bg-surface-2 px-1.5 py-0.5 font-sans text-[10px] font-medium text-fg-2">
      {children}
    </kbd>
  );
}

/** Index de recherche des trades, construit une seule fois par chargement des données. */
function tradeIndex(trades: Trade[], accounts: Account[]) {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  return sortByTradeTime(trades)
    .slice()
    .reverse()
    .map((trade) => {
      const account = accountById.get(trade.account_id);
      const side = trade.direction === 'long' ? 'achat long buy' : 'vente short sell';
      const search = normalize(
        [trade.instrument, side, account?.name ?? '', account?.firm ?? '', formatDateTime(trade.opened_at), trade.setup ?? '', trade.session ?? '', ...trade.tags].join(' '),
      );
      return { trade, account, search };
    });
}

interface CommandPaletteProps {
  onClose: () => void;
}

/** Recherche rapide (⌘K / Ctrl+K) : actions, pages, comptes et trades. */
export default function CommandPalette({ onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { data: accounts } = useAccounts();
  const { data: trades } = useTrades();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const accountList = useMemo(() => accounts ?? [], [accounts]);
  const tradeEntries = useMemo(() => tradeIndex(trades ?? [], accountList), [trades, accountList]);
  const q = normalize(query.trim());
  const hasQuery = q.length > 0;

  const sections = useMemo<PaletteSection[]>(() => {
    const toItem = (entry: Omit<PaletteItem, 'search'>): PaletteItem => ({
      ...entry,
      search: normalize(`${entry.label} ${entry.detail ?? ''}`),
    });
    const actions = ACTIONS.map(toItem).filter((item) => matchesAll(item.search, q));
    const pages = PAGES.map(toItem).filter((item) => matchesAll(item.search, q));
    const accountHits: PaletteItem[] = hasQuery
      ? accountList
          .filter((a) => matchesAll(normalize(`${a.name} ${a.firm ?? ''} ${a.platform ?? ''} ${a.kind}`), q))
          .map((a) => ({
            id: `account-${a.id}`,
            label: a.name,
            detail: [a.firm, a.platform].filter(Boolean).join(' · ') || 'Compte',
            to: `/comptes/${a.id}`,
            icon: Wallet,
            search: '',
          }))
      : [];
    const pool = hasQuery ? tradeEntries.filter((entry) => matchesAll(entry.search, q)) : tradeEntries.slice(0, 5);
    const tradeHits: PaletteItem[] = pool.slice(0, MAX_TRADE_RESULTS).map(({ trade, account }) => ({
      id: `trade-${trade.id}`,
      label: `${trade.instrument} · ${trade.direction === 'long' ? 'Achat' : 'Vente'}`,
      detail: `${formatDateTime(trade.opened_at)} · ${account?.name ?? 'Compte supprimé'}`,
      to: `/trades/${trade.id}`,
      icon: ListOrdered,
      value: {
        text: formatMoney(trade.net_pnl, account?.currency ?? DEFAULT_CURRENCY, true),
        className: signClass(trade.net_pnl),
      },
      search: '',
    }));

    const out: PaletteSection[] = [
      { title: 'Actions', items: actions },
      { title: 'Pages', items: pages },
      { title: 'Comptes', items: accountHits },
      { title: hasQuery ? 'Trades' : 'Trades récents', items: tradeHits },
    ];
    return out.filter((section) => section.items.length > 0);
  }, [q, hasQuery, accountList, tradeEntries]);

  const flat = sections.flatMap((section) => section.items);
  const current = Math.min(active, Math.max(flat.length - 1, 0));
  const positionOf = new Map(flat.map((item, i) => [item.id, i]));

  // Focus à l’ouverture ; on rend le focus à l’élément précédent à la fermeture
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' });
  }, [current]);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(current + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(current - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[current];
      if (item) go(item.to);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <motion.div
      className="no-print fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer la recherche"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/70 backdrop-blur-sm"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Recherche rapide"
        initial={reduce ? false : { opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25, ease: EASE }}
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-card"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={LIST_ID}
            aria-autocomplete="list"
            aria-activedescendant={flat[current] ? optionId(current) : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Chercher un trade, un compte ou une page…"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-muted focus:outline-none"
          />
          <Key>Échap</Key>
        </div>

        <div id={LIST_ID} role="listbox" aria-label="Résultats" className="max-h-[60vh] overflow-y-auto p-2">
          {flat.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-muted">Aucun résultat pour « {query.trim()} ».</p>
          )}
          {sections.map((section) => (
            <div key={section.title} role="presentation" className="pb-1">
              <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted">{section.title}</div>
              {section.items.map((item) => {
                const index = positionOf.get(item.id) ?? 0;
                const selected = index === current;
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item.to)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                      selected ? 'bg-surface-3 text-fg' : 'text-fg-2',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line-2 bg-surface-2',
                        selected && 'border-accent/30 text-accent',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      {item.detail && <span className="block truncate text-xs text-muted">{item.detail}</span>}
                    </span>
                    {item.value && (
                      <span className={cn('shrink-0 text-sm font-semibold tabular-nums', item.value.className)}>
                        {item.value.text}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="hidden items-center gap-4 border-t border-line px-4 py-2.5 text-[11px] text-muted sm:flex">
          <span className="flex items-center gap-1.5">
            <Key>↑</Key>
            <Key>↓</Key>
            naviguer
          </span>
          <span className="flex items-center gap-1.5">
            <Key>Entrée</Key>
            ouvrir
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Key>{SEARCH_SHORTCUT}</Key>
            basculer
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
