import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Pencil, Trash2, X } from 'lucide-react';
import { useProfile, useRefresh, useRepo } from '../data/hooks';
import { formatDateTime, formatDuration, formatMoney, formatNumber, formatR } from '../lib/format';
import type { Account, Trade } from '../lib/types';
import { errorMessage, useToast } from './Toast';
import { ShotThumb } from './Screenshots';
import { Badge, Button, PnlAmount, buttonStyles } from './ui';

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** R:R prévu, à partir de l’entrée, du stop et de l’objectif. Null si une valeur manque ou si le risque est nul. */
export function plannedRiskReward(trade: Pick<Trade, 'entry_price' | 'stop_loss' | 'take_profit'>): number | null {
  const { entry_price: entry, stop_loss: stop, take_profit: target } = trade;
  if (entry == null || stop == null || target == null) return null;
  const risk = Math.abs(entry - stop);
  if (risk === 0) return null;
  return Math.abs(target - entry) / risk;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Garde le focus dans le panneau : Tab et Maj+Tab bouclent sur les éléments interactifs. */
function trapFocus(event: KeyboardEvent, panel: HTMLElement) {
  const items = [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!panel.contains(active)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

interface TradeDrawerProps {
  trade: Trade;
  account: Account | undefined;
  /** Rang du trade dans la liste affichée (filtres appliqués), pour le compteur « 3 / 21 ». */
  position: { index: number; total: number } | null;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Détail d’un trade en lecture seule. Tiroir à droite sur ordinateur, feuille du bas sur mobile.
 * Modifier ouvre le formulaire ; Supprimer demande confirmation.
 */
export function TradeDrawer({ trade, account, position, onPrev, onNext, onClose, onDeleted }: TradeDrawerProps) {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const { data: profile } = useProfile();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);

  const currency = account?.currency ?? 'USD';
  const long = trade.direction === 'long';
  const risk = trade.risk_amount && trade.risk_amount > 0 ? trade.risk_amount : null;
  const realizedR = risk === null ? null : trade.net_pnl / risk;
  const plannedRR = plannedRiskReward(trade);
  const checklistTotal = profile?.checklist.length ?? 0;
  const duration = trade.closed_at
    ? formatDuration(new Date(trade.closed_at).getTime() - new Date(trade.opened_at).getTime())
    : '—';
  const closeLabel = !trade.closed_at
    ? 'en cours'
    : new Date(trade.closed_at).toDateString() === new Date(trade.opened_at).toDateString()
      ? TIME.format(new Date(trade.closed_at))
      : formatDateTime(trade.closed_at);
  const showShots = repo.supportsScreenshots || trade.screenshots.length > 0;

  const remove = useMutation({
    mutationFn: () => repo.deleteTrades([trade.id]),
    onSuccess: async () => {
      await refresh();
      toast.show('Trade supprimé');
      onDeleted();
    },
    onError: (error) => toast.show(errorMessage(error), 'error'),
  });

  // Ouverture : le focus entre dans le panneau et le défilement de la page est figé.
  // Fermeture : le focus revient à l’élément qui a ouvert le détail.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('button[aria-label="Fermer le détail"]')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab' && panelRef.current) {
        trapFocus(event, panelRef.current);
        return;
      }
      if (isTyping(event.target)) return;
      if (event.key === 'ArrowLeft' && onPrev) onPrev();
      if (event.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  // Rendu dans <body> : le tiroir et son fond passent au-dessus de la barre de navigation mobile,
  // qui est hors du contexte d’empilement de la page.
  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="trade-drawer fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-line-2 bg-surface shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[580px] md:rounded-none md:border-l md:border-t-0"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-2 md:hidden" aria-hidden="true" />

        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-3 md:px-7 md:pt-6">
          <p className="min-w-0 truncate text-xs text-muted">Trade · {account?.name ?? 'Compte supprimé'}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            {position && (
              <span className="mr-1 text-xs tabular-nums text-muted">
                {position.index + 1} / {position.total}
              </span>
            )}
            <IconButton label="Trade précédent" onClick={onPrev}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton label="Trade suivant" onClick={onNext}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton label="Fermer le détail" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 md:px-7">
          <div className="pt-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id={titleId} className="font-serif text-4xl leading-none tracking-tight text-fg md:text-5xl">
                {trade.instrument}
              </h2>
              <Badge tone={long ? 'good' : 'bad'}>{long ? 'Achat' : 'Vente'}</Badge>
              {trade.source === 'import' && <Badge tone="info">Importé</Badge>}
              {trade.setup && <Badge>{trade.setup}</Badge>}
            </div>
            <p className="mt-3 text-sm tabular-nums text-muted">
              {formatDateTime(trade.opened_at)} → {closeLabel} · {duration}
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-line-2 bg-surface-2/60 p-5 md:p-6">
            <p className="text-[13px] text-muted">P&amp;L net</p>
            <PnlAmount value={trade.net_pnl} currency={currency} className="mt-1 block font-serif text-4xl tracking-tight md:text-5xl" />
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
              {realizedR !== null && (
                <Badge tone={realizedR > 0 ? 'good' : realizedR < 0 ? 'bad' : 'neutral'}>{formatR(realizedR)}</Badge>
              )}
              <span className="tabular-nums">
                brut {formatMoney(trade.gross_pnl, currency, true)} · frais {formatMoney(-trade.fees, currency, true)}
              </span>
            </div>
          </div>

          {showShots && (
            <Block title="Captures d’écran">
              {trade.screenshots.length === 0 ? (
                <p className="text-sm text-muted">Aucune capture. Tu peux en ajouter depuis Modifier.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {trade.screenshots.map((path) => (
                    <ShotThumb key={path} path={path} className="w-full" />
                  ))}
                </div>
              )}
            </Block>
          )}

          <Block title="Position">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
              <Cell label="Entrée" value={formatNumber(trade.entry_price, 6)} />
              <Cell label="Sortie" value={formatNumber(trade.exit_price, 6)} />
              <Cell label="Taille" value={formatNumber(trade.size, 2)} />
              <Cell label="Stop loss" value={formatNumber(trade.stop_loss, 6)} />
              <Cell label="Objectif" value={formatNumber(trade.take_profit, 6)} />
              <Cell label="Risque prévu" value={formatMoney(trade.risk_amount, currency)} />
              <Cell label="R:R prévu" value={plannedRR === null ? '—' : `1 : ${formatNumber(plannedRR, 1)}`} />
              <Cell label="Session" value={trade.session ?? '—'} />
              <Cell label="Timeframe" value={trade.timeframe ?? '—'} />
            </dl>
          </Block>

          <Block title="Discipline & psychologie">
            <div className="space-y-4 rounded-xl border border-line bg-surface-2/40 p-4 text-sm">
              <Row label="Plan">
                {trade.plan_respected === null ? (
                  <span className="text-muted">Non renseigné</span>
                ) : trade.plan_respected ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-gain">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Respecté
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-loss">
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Non respecté
                  </span>
                )}
              </Row>
              <Row label="Émotions avant">{chips(trade.emotions_before)}</Row>
              <Row label="Émotions après">{chips(trade.emotions_after)}</Row>
              <Row label="Erreurs">{chips(trade.mistakes, 'bad')}</Row>
              <Row label="Checklist">
                <span className="tabular-nums text-fg-2">
                  {checklistTotal > 0
                    ? `${trade.checklist_done.length} / ${checklistTotal} points`
                    : `${trade.checklist_done.length} coché(s)`}
                </span>
              </Row>
            </div>
          </Block>

          <Block title="Notes">
            {trade.notes ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-fg-2">{trade.notes}</p>
            ) : (
              <p className="text-sm text-muted">Aucune note.</p>
            )}
            {trade.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {trade.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            )}
          </Block>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-7">
          <Button
            variant="ghost"
            className="text-loss hover:text-loss"
            loading={remove.isPending}
            onClick={() => {
              if (window.confirm('Supprimer ce trade ? Action irréversible.')) remove.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Supprimer
          </Button>
          <Link to={`/trades/${trade.id}`} className={buttonStyles('primary')}>
            <Pencil className="h-4 w-4" aria-hidden />
            Modifier
          </Link>
        </footer>
      </aside>
    </>,
    document.body,
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: (() => void) | null; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!onClick}
      onClick={() => onClick?.()}
      className="grid h-9 w-9 place-items-center rounded-xl border border-line-2 bg-surface-2 text-fg-2 transition-colors hover:border-muted/40 hover:text-fg disabled:opacity-40 disabled:hover:border-line-2 disabled:hover:text-fg-2"
    >
      {children}
    </button>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="mb-3 text-[13px] font-medium text-fg-2">{title}</h3>
      {children}
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-surface p-3.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-fg">{value}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="shrink-0 text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5 sm:justify-end">{children}</div>
    </div>
  );
}

function chips(items: string[], tone: 'neutral' | 'bad' = 'neutral'): ReactNode {
  if (items.length === 0) return <span className="text-muted">—</span>;
  return items.map((item) => (
    <Badge key={item} tone={tone}>
      {item}
    </Badge>
  ));
}
