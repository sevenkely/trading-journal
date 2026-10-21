import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Info,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Upload,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import CommandPalette from './CommandPalette';
import { useShortcuts } from './useShortcuts';
import { EASE, Loading, SEARCH_SHORTCUT, buttonStyles, cn } from './ui';
import { LogoMark } from './Logo';

interface NavEntry {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  end: boolean;
}

const NAV: NavEntry[] = [
  { to: '/', label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard, end: true },
  { to: '/comptes', label: 'Comptes', short: 'Comptes', icon: Wallet, end: false },
  { to: '/trades', label: 'Trades', short: 'Trades', icon: ListOrdered, end: false },
  { to: '/journal', label: 'Journal', short: 'Journal', icon: BookOpen, end: false },
  { to: '/analyse', label: 'Analyse', short: 'Analyse', icon: BarChart3, end: false },
  { to: '/bilan', label: 'Bilan', short: 'Bilan', icon: CalendarDays, end: false },
  { to: '/import', label: 'Import', short: 'Import', icon: Upload, end: false },
  { to: '/parametres', label: 'Paramètres', short: 'Réglages', icon: Settings, end: false },
];

/** Pages accessibles dans la barre du bas (mobile) ; le reste passe par « Plus ». */
const TAB_PATHS = ['/', '/trades', '/journal', '/analyse'];
const TABS = NAV.filter((entry) => TAB_PATHS.includes(entry.to));
const MORE = NAV.filter((entry) => !TAB_PATHS.includes(entry.to));


function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3">
      <LogoMark size="md" animate />
      <span className="leading-tight">
        <span className="block font-serif text-lg leading-none tracking-tight text-fg">Seven Journal</span>
        <span className="mt-0.5 block text-[11px] text-muted">Prop firm &amp; compte perso</span>
      </span>
    </Link>
  );
}

function SideLink({ entry, onNavigate }: { entry: NavEntry; onNavigate?: () => void }) {
  const { to, label, icon: Icon, end } = entry;
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors duration-200 hover:text-fg"
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="side-active"
              className="absolute inset-0 rounded-xl border border-line-2 bg-surface-3"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <Icon
            className={cn('relative h-[18px] w-[18px] transition-colors duration-200', isActive ? 'text-accent' : 'group-hover:text-fg-2')}
            aria-hidden
          />
          <span className={cn('relative', isActive && 'text-fg')}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function TabLink({ entry }: { entry: NavEntry }) {
  const { to, short, icon: Icon, end } = entry;
  return (
    <NavLink
      to={to}
      end={end}
      className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted"
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="tab-active"
              className="absolute top-0 h-0.5 w-8 rounded-full bg-accent"
              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
            />
          )}
          <Icon className={cn('h-5 w-5', isActive && 'text-accent')} aria-hidden />
          <span className={cn(isActive && 'text-fg')}>{short}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { mode, email, signOut } = useAuth();
  const location = useLocation();
  const outlet = useOutlet();
  useShortcuts();
  const reduce = useReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Raccourci global ⌘K / Ctrl+K pour la recherche rapide
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const initial = email?.charAt(0).toUpperCase() ?? '?';

  return (
    <div className="app-glow relative min-h-dvh">
      {/* Trame de fond : un quadrillage de terminal, estompé avant le contenu */}
      <div aria-hidden className="bg-grid no-print pointer-events-none absolute inset-x-0 top-0 h-[70vh]" />

      {/* Navigation latérale (ordinateur) */}
      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-panel/90 px-4 py-6 backdrop-blur-xl md:flex">
        <Brand />
        <Link to="/trades/nouveau" className={buttonStyles('primary', 'md', 'mt-8 w-full')}>
          <Plus className="h-4 w-4" aria-hidden />
          Nouveau trade
        </Link>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-line-2 bg-surface/60 px-3 py-2.5 text-sm text-muted transition-colors hover:border-muted/40 hover:text-fg"
        >
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4" aria-hidden />
            Rechercher
          </span>
          <kbd className="rounded-md border border-line-2 bg-surface-2 px-1.5 py-0.5 font-sans text-[10px] font-medium text-fg-2">
            {SEARCH_SHORTCUT}
          </kbd>
        </button>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Navigation principale">
          {NAV.map((entry) => (
            <SideLink key={entry.to} entry={entry} />
          ))}
        </nav>
        <div className="mt-auto">
          {mode === 'local' ? (
            <p className="flex items-center gap-2 px-1 text-xs text-muted">
              <Info className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              Mode démo · données locales
            </p>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface/70 p-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                {initial}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-fg-2">{email}</span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-3 hover:text-fg"
                aria-label="Se déconnecter"
                title="Se déconnecter"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="print-flat relative z-10 md:pl-64">
        {/* En-tête mobile */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-panel/85 px-4 py-3 backdrop-blur-xl md:hidden">
          <Brand />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Rechercher"
              className="grid h-8 w-8 place-items-center rounded-xl border border-line-2 bg-surface-2 text-fg-2"
            >
              <Search className="h-4 w-4" aria-hidden />
            </button>
            <Link to="/trades/nouveau" className={buttonStyles('primary', 'sm')}>
              <Plus className="h-4 w-4" aria-hidden />
              Trade
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] px-4 pb-32 pt-6 md:px-10 md:pb-20 md:pt-10">
          {mode === 'local' && (
            <div className="no-print mb-8 flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent/[0.06] px-4 py-3 text-sm leading-relaxed text-fg-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <p>
                <strong className="font-semibold text-accent-hi">Mode démo</strong> : tes données restent dans ce navigateur.
                Configure Supabase (voir le README) pour les synchroniser et les sécuriser.
              </p>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6, transition: { duration: 0.2, ease: EASE } }}
              transition={{ duration: 0.24, ease: EASE }}
            >
              <Suspense fallback={<Loading />}>{outlet}</Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Barre de navigation mobile */}
      <nav
        aria-label="Navigation mobile"
        className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        {TABS.map((entry) => (
          <TabLink key={entry.to} entry={entry} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          <span>Plus</span>
        </button>
      </nav>

      {/* Menu « Plus » (mobile) */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            className="fixed inset-0 z-40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setMoreOpen(false)}
              className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Autres pages"
              initial={reduce ? false : { y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 48, opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="absolute inset-x-3 bottom-3 rounded-3xl border border-line-2 bg-surface p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-card"
            >
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <span className="font-serif text-xl text-fg">Autres pages</span>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="rounded-lg p-2 text-muted hover:bg-surface-3 hover:text-fg"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="space-y-1">
                {MORE.map((entry) => (
                  <SideLink key={entry.to} entry={entry} onNavigate={() => setMoreOpen(false)} />
                ))}
                {mode === 'supabase' && (
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:text-loss"
                  >
                    <LogOut className="h-[18px] w-[18px]" aria-hidden />
                    Se déconnecter
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recherche rapide (⌘K) */}
      <AnimatePresence>
        {paletteOpen && <CommandPalette key="palette" onClose={() => setPaletteOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
