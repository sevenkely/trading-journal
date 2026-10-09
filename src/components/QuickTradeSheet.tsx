import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { useRefresh, useRepo } from '../data/hooks';
import { formatR, fromDateTimeLocal, toDateTimeLocal } from '../lib/format';
import { createTradeWithScreenshots } from '../lib/screenshots';
import { round2 } from '../lib/utils';
import type { Account, Direction, TradeInput } from '../lib/types';
import { trapFocus } from './focusTrap';
import { errorMessage, useToast } from './Toast';
import { Button, EASE, Field, Input, PnlAmount, Select, buttonStyles, cn } from './ui';

type PlanChoice = 'yes' | 'no' | 'unknown';

const PLAN_CHOICES: { value: PlanChoice; label: string }[] = [
  { value: 'yes', label: 'Oui' },
  { value: 'no', label: 'Non' },
  { value: 'unknown', label: 'Non renseigné' },
];

/** Nombre saisi avec une virgule ou un point ; vide ou invalide = null. */
function toNumber(raw: string): number | null {
  const value = raw.trim().replace(',', '.');
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Ajout rapide d’un trade : bottom sheet sur mobile, boîte centrée sur ordinateur.
 * Seuls l’essentiel est demandé (compte, instrument, sens, ouverture, P&L net, risque, plan) ; le détail se complète ensuite.
 */
export function QuickTradeSheet({ accounts, defaultAccountId, onClose }: { accounts: Account[]; defaultAccountId: string; onClose: () => void }) {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [instrument, setInstrument] = useState('');
  const [direction, setDirection] = useState<Direction>('long');
  const [openedLocal, setOpenedLocal] = useState(() => toDateTimeLocal(new Date().toISOString()));
  const [net, setNet] = useState('');
  const [risk, setRisk] = useState('');
  const [plan, setPlan] = useState<PlanChoice>('unknown');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab' && panelRef.current) trapFocus(event.nativeEvent, panelRef.current);
  };

  const save = useMutation({
    mutationFn: (input: TradeInput) => createTradeWithScreenshots(repo, input, []),
    onSuccess: async () => {
      await refresh();
      toast.show('Trade ajouté');
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? 'USD';
  const netValue = toNumber(net);
  const riskValue = toNumber(risk);
  const rPreview = netValue !== null && riskValue !== null && riskValue > 0 ? netValue / riskValue : null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const cleanInstrument = instrument.trim().toUpperCase();
    const opened = fromDateTimeLocal(openedLocal);
    if (!accountId) {
      setError('Choisis un compte.');
      return;
    }
    if (!cleanInstrument) {
      setError('Indique l’instrument (ex. EURUSD, NQ).');
      return;
    }
    if (!opened) {
      setError('Indique la date d’ouverture.');
      return;
    }
    if (netValue === null) {
      setError('Indique le P&L net (positif pour un gain, négatif pour une perte).');
      return;
    }
    if (riskValue !== null && riskValue < 0) {
      setError('Le risque ne peut pas être négatif.');
      return;
    }
    save.mutate({
      account_id: accountId,
      instrument: cleanInstrument,
      direction,
      opened_at: opened,
      closed_at: null,
      entry_price: null,
      exit_price: null,
      stop_loss: null,
      take_profit: null,
      size: null,
      risk_amount: riskValue !== null && riskValue > 0 ? riskValue : null,
      gross_pnl: round2(netValue),
      fees: 0,
      session: null,
      setup: null,
      timeframe: null,
      emotions_before: [],
      emotions_after: [],
      plan_respected: plan === 'unknown' ? null : plan === 'yes',
      mistakes: [],
      checklist_done: [],
      notes: null,
      tags: [],
      source: 'manual',
      external_id: null,
      import_batch_id: null,
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onPanelKeyDown}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-line-2 bg-surface shadow-overlay md:max-h-[88vh] md:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              Ajout rapide
            </h2>
            <p className="text-xs text-muted">
              L’essentiel suffit.{' '}
              <Link to="/trades/nouveau" onClick={onClose} className="text-accent underline-offset-2 hover:underline">
                Saisie complète
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l’ajout rapide"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <Field label="Compte *">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Instrument *">
              <Input
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                placeholder="EURUSD, NQ, XAUUSD…"
                autoCapitalize="characters"
                autoFocus
              />
            </Field>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-fg-2">Sens *</span>
              <div className="grid grid-cols-2 gap-2">
                {(['long', 'short'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={direction === d}
                    onClick={() => setDirection(d)}
                    className={cn(
                      'min-h-11 rounded-xl border text-sm font-medium transition-colors',
                      direction === d
                        ? d === 'long'
                          ? 'border-gain/40 bg-gain/10 text-gain'
                          : 'border-loss/40 bg-loss/10 text-loss'
                        : 'border-line-2 bg-surface-2/60 text-muted hover:text-fg-2',
                    )}
                  >
                    {d === 'long' ? 'Achat (long)' : 'Vente (short)'}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Ouverture *" hint="Heure locale de ton navigateur.">
              <Input type="datetime-local" lang="fr-FR" value={openedLocal} onChange={(e) => setOpenedLocal(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="P&L net *" hint="Après frais.">
                <Input inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} placeholder="ex. 150 ou -80" />
              </Field>
              <Field label="Risque" hint="Montant risqué, pour le R.">
                <Input inputMode="decimal" value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="ex. 100" />
              </Field>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-fg-2">Plan respecté</span>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Plan respecté">
                {PLAN_CHOICES.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    aria-pressed={plan === choice.value}
                    onClick={() => setPlan(choice.value)}
                    className={cn(
                      'min-h-11 rounded-xl border px-2 text-sm font-medium transition-colors',
                      plan === choice.value ? 'border-accent/40 bg-accent/10 text-accent-hi' : 'border-line-2 bg-surface-2/60 text-muted hover:text-fg-2',
                    )}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-baseline gap-3 text-sm">
              <span className="text-muted">Net</span>
              <PnlAmount value={netValue} currency={currency} className="font-semibold" />
              <span className="text-muted">R</span>
              <span className="tabular-nums text-fg-2">{formatR(rPreview)}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={buttonStyles('ghost')}>
                Annuler
              </button>
              <Button type="submit" variant="primary" loading={save.isPending}>
                Ajouter
              </Button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body,
  );
}
