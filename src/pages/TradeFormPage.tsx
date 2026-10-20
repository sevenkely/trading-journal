import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useAccounts, useProfile, useRefresh, useRepo, useSetups, useTrades } from '../data/hooks';
import { useUndoableTradeDelete } from '../data/undoableDelete';
import { CONFLUENCES, EMOTIONS, MISTAKES, SESSIONS, TIMEFRAMES } from '../lib/constants';
import { FUTURES_CONTRACTS, parseFuturesSymbol } from '../lib/futures';
import { formatMoney, formatR, fromDateTimeLocal, toDateTimeLocal } from '../lib/format';
import { sessionForDate } from '../lib/metrics';
import { newId, numberOrNull, round2 } from '../lib/utils';
import { MAX_SCREENSHOTS, createTradeWithMedia } from '../lib/screenshots';
import { findSetupByName, normalizeSetupName, resolveSetupRef } from '../lib/setups';
import { VERDICTS, missingStoryRoles, nextRole, roleInfo } from '../lib/story';
import type {
  Account,
  Direction,
  MediaRole,
  Setup,
  SetupInput,
  Trade,
  TradeInput,
  TradeMedia,
  TradeVerdict,
} from '../lib/types';
import { errorMessage, useToast } from '../components/Toast';
import FuturesCalculator, { type FuturesApplyPatch } from '../components/FuturesCalculator';
import { MediaCard, PendingMediaCard, ScreenshotDropzone } from '../components/Screenshots';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
  SectionTitle,
  Textarea,
  buttonStyles,
  cn,
  PnlAmount,
} from '../components/ui';

const numOrNull = numberOrNull;

const str = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

/** Image d’un nouveau trade, pas encore envoyée. `url` sert à l’aperçu. */
interface PendingShot {
  id: string;
  file: File;
  url: string;
  role: MediaRole;
  caption: string;
}

interface TradeFormState {
  account_id: string;
  instrument: string;
  direction: Direction;
  opened_local: string;
  closed_local: string;
  entry_price: string;
  exit_price: string;
  stop_loss: string;
  take_profit: string;
  size: string;
  risk_amount: string;
  gross_pnl: string;
  fees: string;
  session: string;
  setup: string;
  timeframe: string;
  plan: 'yes' | 'no' | 'unknown';
  emotions_before: string[];
  emotions_after: string[];
  mistakes: string[];
  checklist_done: string[];
  notes: string;
  tags: string;
  setup_id: string;
  thesis: string;
  invalidation: string;
  verdict: '' | TradeVerdict;
  confluences: string[];
}

function initialState(trade: Trade | null, accounts: Account[]): TradeFormState {
  if (trade) {
    return {
      account_id: trade.account_id,
      instrument: trade.instrument,
      direction: trade.direction,
      opened_local: toDateTimeLocal(trade.opened_at),
      closed_local: toDateTimeLocal(trade.closed_at),
      entry_price: str(trade.entry_price),
      exit_price: str(trade.exit_price),
      stop_loss: str(trade.stop_loss),
      take_profit: str(trade.take_profit),
      size: str(trade.size),
      risk_amount: str(trade.risk_amount),
      gross_pnl: str(trade.gross_pnl),
      fees: str(trade.fees),
      session: trade.session ?? '',
      setup: trade.setup ?? '',
      timeframe: trade.timeframe ?? '',
      plan: trade.plan_respected === null ? 'unknown' : trade.plan_respected ? 'yes' : 'no',
      emotions_before: trade.emotions_before,
      emotions_after: trade.emotions_after,
      mistakes: trade.mistakes,
      checklist_done: trade.checklist_done,
      notes: trade.notes ?? '',
      tags: trade.tags.join(', '),
      setup_id: trade.setup_id ?? '',
      thesis: trade.thesis ?? '',
      invalidation: trade.invalidation ?? '',
      verdict: trade.verdict ?? '',
      confluences: trade.confluences ?? [],
    };
  }
  const active = accounts.find((a) => a.status === 'active') ?? accounts[0];
  const now = new Date().toISOString();
  return {
    account_id: active?.id ?? '',
    instrument: '',
    direction: 'long',
    opened_local: toDateTimeLocal(now),
    closed_local: '',
    entry_price: '',
    exit_price: '',
    stop_loss: '',
    take_profit: '',
    size: '',
    risk_amount: '',
    gross_pnl: '',
    fees: '0',
    session: sessionForDate(now),
    setup: '',
    timeframe: '',
    plan: 'unknown',
    emotions_before: [],
    emotions_after: [],
    mistakes: [],
    checklist_done: [],
    notes: '',
    tags: '',
    setup_id: '',
    thesis: '',
    invalidation: '',
    verdict: '',
    confluences: [],
  };
}

function buildInput(f: TradeFormState, base: Trade | null): { input: TradeInput } | { error: string } {
  if (!f.account_id) return { error: 'Choisis un compte.' };
  const instrument = f.instrument.trim().toUpperCase();
  if (!instrument) return { error: 'Indique l’instrument (ex. EURUSD, NQ, BTCUSD).' };
  const opened = fromDateTimeLocal(f.opened_local);
  if (!opened) return { error: 'La date d’ouverture est obligatoire.' };
  const closed = f.closed_local ? fromDateTimeLocal(f.closed_local) : null;
  if (f.closed_local && !closed) return { error: 'La date de clôture est invalide.' };
  if (closed && new Date(closed).getTime() < new Date(opened).getTime()) {
    return { error: 'La clôture ne peut pas être antérieure à l’ouverture.' };
  }
  const gross = numOrNull(f.gross_pnl);
  if (gross === null) return { error: 'Le P&L brut est obligatoire (positif pour un gain, négatif pour une perte).' };
  const size = numOrNull(f.size);
  if (size !== null && size < 0) return { error: 'La taille ne peut pas être négative.' };
  const risk = numOrNull(f.risk_amount);
  if (risk !== null && risk < 0) return { error: 'Le risque ne peut pas être négatif.' };

  return {
    input: {
      account_id: f.account_id,
      instrument,
      direction: f.direction,
      opened_at: opened,
      closed_at: closed,
      entry_price: numOrNull(f.entry_price),
      exit_price: numOrNull(f.exit_price),
      stop_loss: numOrNull(f.stop_loss),
      take_profit: numOrNull(f.take_profit),
      size,
      risk_amount: risk,
      gross_pnl: round2(gross),
      fees: round2(Math.abs(numOrNull(f.fees) ?? 0)),
      session: f.session || null,
      setup: f.setup.trim() || null,
      setup_id: f.setup_id || null,
      thesis: f.thesis.trim() || null,
      invalidation: f.invalidation.trim() || null,
      verdict: f.verdict || null,
      confluences: f.confluences,
      timeframe: f.timeframe || null,
      emotions_before: f.emotions_before,
      emotions_after: f.emotions_after,
      plan_respected: f.plan === 'unknown' ? null : f.plan === 'yes',
      mistakes: f.mistakes,
      checklist_done: f.checklist_done,
      notes: f.notes.trim() || null,
      tags: f.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      source: base?.source ?? 'manual',
      external_id: base?.external_id ?? null,
      import_batch_id: base?.import_batch_id ?? null,
    },
  };
}

/** Groupe de choix (pastilles) : un libellé et des boutons, sans <label> englobant. */
function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block space-y-2.5">
      <span className="block text-[13px] font-medium text-fg-2">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-muted">Trade introuvable.</p>
      <Link to="/trades" className="mt-4 inline-block text-sm font-medium text-accent transition-colors hover:text-accent-hi">
        Retour aux trades
      </Link>
    </div>
  );
}

export default function TradeFormPage() {
  const { id } = useParams();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: trades, isLoading: loadingTrades } = useTrades();
  const { data: profile, isLoading: loadingProfile } = useProfile();
  const { data: setups, isLoading: loadingSetups } = useSetups();

  if (loadingAccounts || loadingTrades || loadingProfile || loadingSetups) return <Loading />;

  const accountList = accounts ?? [];
  const tradeList = trades ?? [];
  const checklist = profile?.checklist ?? [];
  const setupList = setups ?? [];

  if (id) {
    const existing = tradeList.find((t) => t.id === id);
    if (!existing) return <NotFound />;
    return (
      <TradeForm
        key={existing.id}
        trade={existing}
        accounts={accountList}
        trades={tradeList}
        checklist={checklist}
        setups={setupList}
      />
    );
  }

  if (accountList.length === 0) {
    return (
      <>
        <PageHeader title="Nouveau trade" />
        <EmptyState
          icon={<ArrowLeft className="h-5 w-5" aria-hidden />}
          title="Crée d’abord un compte"
          description="Un trade doit être rattaché à un compte (personnel, challenge ou financé)."
          action={
            <Link to="/comptes/nouveau" className={buttonStyles('primary')}>
              Créer un compte
            </Link>
          }
        />
      </>
    );
  }

  return <TradeForm key="new" trade={null} accounts={accountList} trades={tradeList} checklist={checklist} setups={setupList} />;
}

function TradeForm({
  trade,
  accounts,
  trades,
  checklist,
  setups,
}: {
  trade: Trade | null;
  accounts: Account[];
  trades: Trade[];
  checklist: string[];
  setups: Setup[];
}) {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState<TradeFormState>(() => initialState(trade, accounts));
  const [error, setError] = useState<string | null>(null);
  // Captures d’un nouveau trade : gardées en mémoire, envoyées à l’enregistrement
  const [shots, setShots] = useState<PendingShot[]>([]);
  const shotsRef = useRef(shots);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);
  useEffect(() => () => shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url)), []);

  /** Chaque image prend la première place libre du récit : contexte, puis déclencheur, puis résultat. */
  const addShots = (files: File[]) => {
    setShots((prev) => {
      const taken: TradeMedia[] = prev.map((shot) => ({ path: shot.id, role: shot.role, caption: null }));
      return [
        ...prev,
        ...files.map((file) => {
          const role = nextRole(taken);
          taken.push({ path: file.name, role, caption: null });
          return { id: newId(), file, url: URL.createObjectURL(file), role, caption: '' };
        }),
      ];
    });
  };

  const removeShot = (id: string) => {
    const target = shotsRef.current.find((shot) => shot.id === id);
    if (target) URL.revokeObjectURL(target.url);
    setShots((prev) => prev.filter((shot) => shot.id !== id));
  };

  const patchShot = (id: string, patch: Partial<Pick<PendingShot, 'role' | 'caption'>>) =>
    setShots((prev) => prev.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)));

  const set = <K extends keyof TradeFormState>(key: K, value: TradeFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** Remplit les champs du trade depuis le calcul futures (taille, risque, P&L brut). */
  const applyFutures = (patch: FuturesApplyPatch) =>
    setForm((prev) => ({
      ...prev,
      size: patch.size === undefined ? prev.size : String(patch.size),
      risk_amount: patch.riskAmount === undefined ? prev.risk_amount : String(patch.riskAmount),
      gross_pnl: patch.grossPnl === undefined ? prev.gross_pnl : String(patch.grossPnl),
    }));

  const toggleIn = (
    key: 'emotions_before' | 'emotions_after' | 'mistakes' | 'checklist_done' | 'confluences',
    value: string,
  ) =>
    setForm((prev) => {
      const list = prev[key];
      return { ...prev, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });

  const save = useMutation({
    mutationFn: async ({ input, pending }: { input: TradeInput; pending: PendingShot[] }) =>
      trade
        ? repo.updateTrade(trade.id, input)
        : createTradeWithMedia(
            repo,
            input,
            pending.map((shot) => ({ file: shot.file, role: shot.role, caption: shot.caption.trim() || null })),
          ),
    onSuccess: async () => {
      await refresh();
      toast.show(trade ? 'Trade mis à jour' : 'Trade enregistré');
      navigate('/trades');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const removeTrade = useUndoableTradeDelete();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Le libellé du setup est conservé ; le lien vers la bibliothèque est résolu au moment d'enregistrer.
    const ref = resolveSetupRef(setups, { setup_id: form.setup_id, setup: form.setup });
    const built = buildInput({ ...form, setup_id: ref.setup_id ?? '', setup: ref.setup ?? '' }, trade);
    if ('error' in built) {
      setError(built.error);
      return;
    }
    setError(null);
    save.mutate({ input: built.input, pending: shots });
  };

  // Aperçu du résultat net et du R multiple
  const grossPreview = numOrNull(form.gross_pnl);
  const feesPreview = Math.abs(numOrNull(form.fees) ?? 0);
  const netPreview = grossPreview === null ? null : round2(grossPreview - feesPreview);
  const riskPreview = numOrNull(form.risk_amount);
  const rPreview = netPreview !== null && riskPreview ? netPreview / riskPreview : null;
  const currency = accounts.find((a) => a.id === form.account_id)?.currency ?? 'USD';

  const instruments = [...new Set(trades.map((t) => t.instrument))];
  const futures = parseFuturesSymbol(form.instrument);
  const balance = accounts.find((a) => a.id === form.account_id)?.initial_balance ?? 0;

  return (
    <>
      <PageHeader
        title={trade ? `Trade · ${trade.instrument}` : 'Nouveau trade'}
        description={
          trade?.source === 'import'
            ? 'Trade importé : tu peux compléter le contexte et la psychologie.'
            : 'Saisie manuelle. Les champs marqués * sont obligatoires.'
        }
        actions={
          <Link to="/trades" className={buttonStyles('ghost')}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Card className="space-y-6">
          <SectionTitle title="Position" />
          <div className="grid gap-5 md:grid-cols-3 xl:grid-cols-5">
            <Field label="Compte *">
              <Select value={form.account_id} onChange={(e) => set('account_id', e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Instrument *">
              <Input
                list="instrument-list"
                value={form.instrument}
                onChange={(e) => set('instrument', e.target.value)}
                placeholder="EURUSD, NQ, XAUUSD…"
                autoCapitalize="characters"
              />
              <datalist id="instrument-list">
                {instruments.map((i) => (
                  <option key={i} value={i} />
                ))}
                {FUTURES_CONTRACTS.map((c) => (
                  <option key={c.root} value={c.root}>
                    {c.name}
                  </option>
                ))}
              </datalist>
              {futures && (
                <span className="block text-xs text-muted">
                  Future {futures.contract.root} · {futures.contract.name} ({futures.contract.exchange}) : le calcul se fait en
                  contrats entiers.
                </span>
              )}
            </Field>
            <ChipGroup label="Sens *">
              <div className="grid w-full grid-cols-2 gap-2">
                {(['long', 'short'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('direction', d)}
                    aria-pressed={form.direction === d}
                    className={cn(
                      'min-h-11 whitespace-normal rounded-xl border px-2 text-center text-sm font-medium leading-tight transition-all duration-200 ease-out-expo active:scale-[0.98] md:min-h-10',
                      form.direction === d
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
            </ChipGroup>
            <Field label="Ouverture *" hint="Heure locale de ton navigateur.">
              <Input type="datetime-local" lang="fr-FR" value={form.opened_local} onChange={(e) => set('opened_local', e.target.value)} />
            </Field>
            <Field label="Clôture" hint="Laisse vide si la position est encore ouverte (non prise en compte).">
              <Input type="datetime-local" lang="fr-FR" value={form.closed_local} onChange={(e) => set('closed_local', e.target.value)} />
            </Field>
            <Field label="Taille (lots / contrats)" hint={futures ? `Contrats entiers (${futures.contract.root}) : 0,5 n'existe pas.` : undefined}>
              <Input inputMode="decimal" value={form.size} onChange={(e) => set('size', e.target.value)} placeholder="1" />
            </Field>
            <Field label="Prix d’entrée">
              <Input inputMode="decimal" value={form.entry_price} onChange={(e) => set('entry_price', e.target.value)} />
            </Field>
            <Field label="Prix de sortie">
              <Input inputMode="decimal" value={form.exit_price} onChange={(e) => set('exit_price', e.target.value)} />
            </Field>
            <Field label="Stop loss">
              <Input inputMode="decimal" value={form.stop_loss} onChange={(e) => set('stop_loss', e.target.value)} />
            </Field>
            <Field label="Take profit">
              <Input inputMode="decimal" value={form.take_profit} onChange={(e) => set('take_profit', e.target.value)} />
            </Field>
          </div>
        </Card>

        <FuturesCalculator
          instrument={form.instrument}
          balance={balance}
          currency={currency}
          direction={form.direction}
          entry={form.entry_price}
          stop={form.stop_loss}
          takeProfit={form.take_profit}
          exit={form.exit_price}
          size={form.size}
          onApply={applyFutures}
        />

        <Card className="space-y-6">
          <SectionTitle title="Résultat & risque" description="Le P&L net = P&L brut − frais. Un gain est positif, une perte négative." />
          <div className="grid items-start gap-5 md:grid-cols-4">
            <Field label="P&L brut *" hint={`Devise du compte : ${currency}`}>
              <Input
                inputMode="decimal"
                value={form.gross_pnl}
                onChange={(e) => set('gross_pnl', e.target.value)}
                placeholder="ex. -150 ou 320"
              />
            </Field>
            <Field label="Frais (commissions, swap)">
              <Input inputMode="decimal" value={form.fees} onChange={(e) => set('fees', e.target.value)} />
            </Field>
            <Field label="Risque prévu (montant)" hint="Sert à calculer le R multiple.">
              <Input inputMode="decimal" value={form.risk_amount} onChange={(e) => set('risk_amount', e.target.value)} placeholder="ex. 100" />
            </Field>
            <div className="rounded-xl border border-line-2 bg-surface-2/60 p-4">
              <div className="text-[13px] text-muted">Aperçu</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-fg">
                {netPreview === null ? '—' : formatMoney(netPreview, currency, true)}
              </div>
              <div className="mt-0.5 text-xs text-muted">R : {formatR(rPreview)}</div>
            </div>
          </div>
        </Card>

        <Card className="space-y-6">
          <SectionTitle title="Contexte & setup" />
          <div className="grid gap-5 md:grid-cols-3">
            <SetupField
              setups={setups}
              setupId={form.setup_id}
              setupLabel={form.setup}
              onChange={(next) => setForm((prev) => ({ ...prev, setup_id: next.id, setup: next.name }))}
            />
            <Field label="Session">
              <Select value={form.session} onChange={(e) => set('session', e.target.value)}>
                <option value="">— Non renseignée —</option>
                {SESSIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Timeframe">
              <Select value={form.timeframe} onChange={(e) => set('timeframe', e.target.value)}>
                <option value="">— Non renseigné —</option>
                {TIMEFRAMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="space-y-6">
          <SectionTitle
            title="Raison d’entrer"
            description="Trois lignes suffisent. Ce qui compte, c’est de pouvoir relire cette page à froid, sans t’être menti."
          />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Thèse" hint="Ce que tu attends du marché, et pourquoi maintenant.">
              <Textarea
                value={form.thesis}
                onChange={(e) => set('thesis', e.target.value)}
                rows={4}
                placeholder="Ex. Sweep du low de la séance de Londres, retour dans la zone H1…"
              />
            </Field>
            <Field label="Invalidation" hint="Ce qui te prouve que tu as tort, avant même que le stop ne saute.">
              <Textarea
                value={form.invalidation}
                onChange={(e) => set('invalidation', e.target.value)}
                rows={4}
                placeholder="Ex. Clôture H1 au-dessus de 20 150"
              />
            </Field>
          </div>
          <ChipGroup label="Confluences">
            {CONFLUENCES.map((c) => (
              <Chip key={c} active={form.confluences.includes(c)} onClick={() => toggleIn('confluences', c)}>
                {c}
              </Chip>
            ))}
          </ChipGroup>
          <div className="space-y-2.5">
            <ChipGroup label="Le verdict, après coup">
              {VERDICTS.map((v) => (
                <Chip
                  key={v.value}
                  active={form.verdict === v.value}
                  onClick={() => set('verdict', form.verdict === v.value ? '' : v.value)}
                >
                  {v.label}
                </Chip>
              ))}
            </ChipGroup>
            <p className="text-xs text-muted">La même puce désactive le choix.</p>
          </div>
        </Card>

        <MediaPanel trade={trade} pending={shots} onAdd={addShots} onPatch={patchShot} onRemovePending={removeShot} />

        <Card className="space-y-6">
          <SectionTitle title="Discipline & psychologie" description="Ce que tu ressens et ce que tu as fait, honnêtement." />
          <ChipGroup label="As-tu respecté ton plan ?">
            {(
              [
                ['yes', 'Oui'],
                ['no', 'Non'],
                ['unknown', 'Non renseigné'],
              ] as const
            ).map(([value, label]) => (
              <Chip key={value} active={form.plan === value} onClick={() => set('plan', value)}>
                {label}
              </Chip>
            ))}
          </ChipGroup>

          <ChipGroup label="Émotions avant le trade">
            {EMOTIONS.map((e) => (
              <Chip key={e} active={form.emotions_before.includes(e)} onClick={() => toggleIn('emotions_before', e)}>
                {e}
              </Chip>
            ))}
          </ChipGroup>

          <ChipGroup label="Émotions après le trade">
            {EMOTIONS.map((e) => (
              <Chip key={e} active={form.emotions_after.includes(e)} onClick={() => toggleIn('emotions_after', e)}>
                {e}
              </Chip>
            ))}
          </ChipGroup>

          <ChipGroup label="Erreurs commises">
            {MISTAKES.map((m) => (
              <Chip key={m} active={form.mistakes.includes(m)} onClick={() => toggleIn('mistakes', m)}>
                {m}
              </Chip>
            ))}
          </ChipGroup>

          <div className="space-y-2.5">
            <span className="block text-[13px] font-medium text-fg-2">Checklist pré-trade</span>
            {checklist.length === 0 ? (
              <p className="text-xs text-muted">
                Aucun point dans ta checklist. Tu peux en ajouter dans{' '}
                <Link to="/parametres" className="font-medium text-accent hover:text-accent-hi">
                  Paramètres
                </Link>
                .
              </p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {checklist.map((item) => {
                  const checked = form.checklist_done.includes(item);
                  return (
                    <li key={item}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors duration-200',
                          checked
                            ? 'border-gain/35 bg-gain/10 text-fg'
                            : 'border-line-2 bg-surface-2/50 text-fg-2 hover:border-muted/40',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleIn('checklist_done', item)}
                          className="h-4 w-4 shrink-0 accent-gain"
                        />
                        {item}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card className="grid gap-6 md:grid-cols-2">
          <Field label="Notes" hint="Ton raisonnement, ce que tu aurais pu faire mieux…">
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={5} />
          </Field>
          <Field label="Tags" hint="Séparés par des virgules (ex. news, revenge, A+)">
            <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="news, A+" />
          </Field>
        </Card>

        {error && (
          <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        )}

        <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line-2 bg-surface/95 p-2.5 shadow-card backdrop-blur-xl md:bottom-4 md:gap-3 md:p-3">
          {trade ? (
            <Button
              variant="ghost"
              className="text-loss hover:text-loss"
              onClick={() => {
                if (trade) removeTrade([trade.id], 'Trade supprimé');
                navigate('/trades');
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-baseline gap-2 text-xs md:gap-3 md:text-sm" aria-label="Résumé en direct">
            <span className="text-muted">Net</span>
            <PnlAmount value={netPreview} currency={currency} className="font-semibold" />
            <span className="text-muted">R</span>
            <span className="tabular-nums text-fg-2">{formatR(rPreview)}</span>
          </div>
          <div className="flex gap-2">
            <Link to="/trades" className={buttonStyles('ghost')}>
              Annuler
            </Link>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {trade ? 'Enregistrer' : 'Ajouter le trade'}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

function MediaPanel({
  trade,
  pending,
  onAdd,
  onPatch,
  onRemovePending,
}: {
  trade: Trade | null;
  pending: PendingShot[];
  onAdd: (files: File[]) => void;
  onPatch: (id: string, patch: Partial<Pick<PendingShot, 'role' | 'caption'>>) => void;
  onRemovePending: (id: string) => void;
}) {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  // Les légendes partent au moment où le champ perd le focus, pas à chaque lettre.
  const [captions, setCaptions] = useState<Record<string, string>>({});

  const saveMedia = useMutation({
    mutationFn: async (media: TradeMedia[]) => {
      if (!trade) return;
      await repo.updateTrade(trade.id, { media });
    },
    onSuccess: () => void refresh(),
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  // Trade existant : chaque image part tout de suite, avec sa place dans le dossier
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (!trade) return;
      const taken = [...trade.media];
      const uploaded: TradeMedia[] = [];
      try {
        for (const file of files) {
          const path = await repo.uploadScreenshot(trade.id, file);
          const item: TradeMedia = { path, role: nextRole(taken), caption: null };
          uploaded.push(item);
          taken.push(item);
        }
        await repo.updateTrade(trade.id, { media: taken });
      } catch (error) {
        // Rien ne doit rester dans le stockage sans référence dans le trade
        await Promise.allSettled(uploaded.map((item) => repo.deleteScreenshotFile(item.path)));
        throw error;
      }
    },
    onSuccess: async () => {
      await refresh();
      toast.show('Image ajoutée au dossier');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const removeShot = useMutation({
    mutationFn: async (path: string) => {
      if (!trade) return;
      await repo.updateTrade(trade.id, { media: trade.media.filter((m) => m.path !== path) });
      await repo.deleteScreenshotFile(path);
    },
    onSuccess: async () => {
      await refresh();
      toast.show('Image supprimée');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const count = trade ? trade.media.length : pending.length;

  const placed = trade ? trade.media : pending.map((shot) => ({ path: shot.id, role: shot.role, caption: null }));
  const missing = missingStoryRoles(placed);
  // En mode démo, les fichiers ne sont pas stockés : annoncer un dossier incomplet serait trompeur.
  const canStore = repo.supportsScreenshots;

  return (
    <Card className="space-y-5">
      <SectionTitle
        title="Le dossier visuel"
        description={`Trois images suffisent à raconter le trade : le contexte HTF, le déclencheur LTF, puis le résultat. ${MAX_SCREENSHOTS} au maximum.`}
        action={
          canStore ? (
            <Badge tone={missing.length === 0 ? 'good' : 'neutral'}>
              {missing.length === 0 ? 'Dossier complet' : `Il manque : ${missing.map((role) => roleInfo(role).short).join(', ')}`}
            </Badge>
          ) : undefined
        }
      />
      {!canStore ? (
        <p className="text-sm text-muted">
          Les images sont disponibles lorsque la base Supabase est connectée. Le mode démo ne les stocke pas — les
          rôles et les légendes, eux, restent enregistrés.
        </p>
      ) : (
        <>
          {count > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {trade
                ? trade.media.map((item) => (
                    <MediaCard
                      key={item.path}
                      media={{ ...item, caption: captions[item.path] ?? item.caption }}
                      disabled={saveMedia.isPending}
                      onRoleChange={(role) =>
                        saveMedia.mutate(trade.media.map((m) => (m.path === item.path ? { ...m, role } : m)))
                      }
                      onCaptionChange={(caption) => setCaptions((prev) => ({ ...prev, [item.path]: caption }))}
                      onCaptionBlur={() => {
                        const value = (captions[item.path] ?? item.caption ?? '').trim() || null;
                        if (value !== item.caption) {
                          saveMedia.mutate(trade.media.map((m) => (m.path === item.path ? { ...m, caption: value } : m)));
                        }
                      }}
                      onRemove={() => removeShot.mutate(item.path)}
                    />
                  ))
                : pending.map((shot, index) => (
                    <PendingMediaCard
                      key={shot.id}
                      index={index}
                      url={shot.url}
                      role={shot.role}
                      caption={shot.caption}
                      onRoleChange={(role) => onPatch(shot.id, { role })}
                      onCaptionChange={(caption) => onPatch(shot.id, { caption })}
                      onRemove={() => onRemovePending(shot.id)}
                    />
                  ))}
            </div>
          )}
          {missing.length === 0 ? (
            <p className="text-[13px] text-fg-2">
              Le dossier est complet : contexte, déclencheur et résultat. C’est ce qui rend la relecture possible.
            </p>
          ) : (
            <p className="text-[13px] text-muted">
              Chaque image déposée prend la place libre suivante ; tu peux la déplacer d’un clic sur un rôle.
            </p>
          )}
          <ScreenshotDropzone
            count={count}
            disabled={upload.isPending || removeShot.isPending}
            onFiles={trade ? (files) => upload.mutate(files) : onAdd}
          />
        </>
      )}
    </Card>
  );
}

/** Choix du setup dans la bibliothèque, avec création à la volée. */
function SetupField({
  setups,
  setupId,
  setupLabel,
  onChange,
}: {
  setups: Setup[];
  setupId: string;
  setupLabel: string;
  onChange: (next: { id: string; name: string }) => void;
}) {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: (input: SetupInput) => repo.createSetup(input),
    onSuccess: async (created) => {
      await refresh();
      onChange({ id: created.id, name: created.name });
      setCreating(false);
      setName('');
      toast.show(`Setup « ${created.name} » ajouté à la bibliothèque`);
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const selected = setups.find((s) => s.id === setupId) ?? findSetupByName(setups, setupLabel);
  // Un trade importé peut porter un libellé qui n’est pas encore dans la bibliothèque : on le garde visible.
  const legacy = !selected && setupLabel.trim() ? normalizeSetupName(setupLabel) : null;
  const value = selected?.id ?? (legacy ? '__legacy' : '');

  return (
    <Field
      label="Setup"
      hint={selected?.htf ?? 'Un setup écrit une fois se mesure ensuite, trade après trade.'}
    >
      <div className="space-y-2">
        <Select
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            if (next === '__new') {
              setCreating(true);
              return;
            }
            if (next === '__legacy') return;
            const found = setups.find((s) => s.id === next);
            onChange({ id: found?.id ?? '', name: found?.name ?? '' });
          }}
        >
          <option value="">— Aucun setup —</option>
          {setups.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {legacy && <option value="__legacy">{legacy} (hors bibliothèque)</option>}
          <option value="__new">＋ Nouveau setup…</option>
        </Select>
        {creating && (
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nom du setup"
              aria-label="Nom du nouveau setup"
            />
            <Button
              size="sm"
              variant="primary"
              loading={create.isPending}
              disabled={!normalizeSetupName(name)}
              onClick={() =>
                create.mutate({
                  name: normalizeSetupName(name),
                  description: null,
                  htf: null,
                  invalidation: null,
                  checklist: [],
                })
              }
            >
              Créer
            </Button>
          </div>
        )}
      </div>
    </Field>
  );
}
