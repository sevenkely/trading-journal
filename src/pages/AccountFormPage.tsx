import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useAccounts, useProfile, useRefresh, useRepo } from '../data/hooks';
import {
  ACCOUNT_KINDS,
  ACCOUNT_STATUSES,
  CURRENCIES,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  PLATFORMS,
  PROP_FIRMS,
  TIMEZONES,
} from '../lib/constants';
import { formatMoney } from '../lib/format';
import { resolveAmount } from '../lib/rules';
import type { Account, AccountInput, AccountKind, AccountStatus, DrawdownType } from '../lib/types';
import { errorMessage, useToast } from '../components/Toast';
import { Button, Card, Field, Input, Loading, PageHeader, Select, SectionTitle, buttonStyles } from '../components/ui';

interface AccountFormState {
  name: string;
  kind: AccountKind;
  status: AccountStatus;
  firm: string;
  platform: string;
  currency: string;
  initial_balance: string;
  day_timezone: string;
  drawdown_type: DrawdownType;
  daily_loss_amount: string;
  daily_loss_pct: string;
  max_loss_amount: string;
  max_loss_pct: string;
  profit_target_amount: string;
  profit_target_pct: string;
  min_trading_days: string;
  consistency_pct: string;
}

const numOrNull = (v: string): number | null => {
  const s = v.replace(',', '.').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const str = (v: number | null): string => (v === null || v === undefined ? '' : String(v));

function toForm(a: Account | null, defaults: { currency: string; timezone: string }): AccountFormState {
  if (!a) {
    return {
      name: '',
      kind: 'evaluation',
      status: 'active',
      firm: '',
      platform: '',
      currency: defaults.currency,
      initial_balance: '',
      day_timezone: defaults.timezone,
      drawdown_type: 'static',
      daily_loss_amount: '',
      daily_loss_pct: '',
      max_loss_amount: '',
      max_loss_pct: '',
      profit_target_amount: '',
      profit_target_pct: '',
      min_trading_days: '0',
      consistency_pct: '',
    };
  }
  return {
    name: a.name,
    kind: a.kind,
    status: a.status,
    firm: a.firm ?? '',
    platform: a.platform ?? '',
    currency: a.currency,
    initial_balance: str(a.initial_balance),
    day_timezone: a.day_timezone,
    drawdown_type: a.drawdown_type,
    daily_loss_amount: str(a.daily_loss_amount),
    daily_loss_pct: str(a.daily_loss_pct),
    max_loss_amount: str(a.max_loss_amount),
    max_loss_pct: str(a.max_loss_pct),
    profit_target_amount: str(a.profit_target_amount),
    profit_target_pct: str(a.profit_target_pct),
    min_trading_days: str(a.min_trading_days),
    consistency_pct: str(a.consistency_pct),
  };
}

function buildAccountInput(f: AccountFormState): { input: AccountInput } | { error: string } {
  if (!f.name.trim()) return { error: 'Donne un nom au compte.' };
  const initial = numOrNull(f.initial_balance);
  if (initial === null || initial <= 0) return { error: 'Le solde initial doit être un nombre positif.' };

  const amounts = [f.daily_loss_amount, f.max_loss_amount, f.profit_target_amount].map(numOrNull);
  if (amounts.some((n) => n !== null && n <= 0)) return { error: 'Les montants de règles doivent être positifs.' };

  const pcts = [f.daily_loss_pct, f.max_loss_pct, f.profit_target_pct, f.consistency_pct].map(numOrNull);
  if (pcts.some((n) => n !== null && (n <= 0 || n > 100))) {
    return { error: 'Les pourcentages doivent être compris entre 0 et 100.' };
  }

  const minDays = numOrNull(f.min_trading_days) ?? 0;
  if (!Number.isInteger(minDays) || minDays < 0) {
    return { error: 'Le nombre de jours minimum doit être un entier positif (ou 0).' };
  }

  return {
    input: {
      name: f.name.trim(),
      kind: f.kind,
      status: f.status,
      firm: f.firm.trim() || null,
      platform: f.platform.trim() || null,
      currency: f.currency.trim().toUpperCase() || DEFAULT_CURRENCY,
      initial_balance: initial,
      day_timezone: f.day_timezone,
      daily_loss_amount: amounts[0],
      daily_loss_pct: pcts[0],
      max_loss_amount: amounts[1],
      max_loss_pct: pcts[1],
      drawdown_type: f.drawdown_type,
      profit_target_amount: amounts[2],
      profit_target_pct: pcts[2],
      min_trading_days: minDays,
      consistency_pct: pcts[3],
    },
  };
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-muted">Élément introuvable.</p>
      <Link to="/comptes" className="mt-4 inline-block text-sm font-medium text-accent transition-colors hover:text-accent-hi">
        Retour aux comptes
      </Link>
    </div>
  );
}

export default function AccountFormPage() {
  const { id } = useParams();
  const { data: accounts, isLoading } = useAccounts();
  const { data: profile } = useProfile();

  if (isLoading) return <Loading />;

  const defaults = {
    currency: profile?.default_currency ?? DEFAULT_CURRENCY,
    timezone: profile?.default_timezone ?? DEFAULT_TIMEZONE,
  };

  if (id) {
    const existing = accounts?.find((a) => a.id === id);
    if (!existing) return <NotFound />;
    return <AccountForm key={existing.id} account={existing} defaults={defaults} />;
  }
  return <AccountForm key="new" account={null} defaults={defaults} />;
}

function AccountForm({ account, defaults }: { account: Account | null; defaults: { currency: string; timezone: string } }) {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState<AccountFormState>(() => toForm(account, defaults));
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof AccountFormState>(key: K, value: AccountFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: (input: AccountInput) => (account ? repo.updateAccount(account.id, input) : repo.createAccount(input)),
    onSuccess: async () => {
      await refresh();
      toast.show(account ? 'Compte mis à jour' : 'Compte créé');
      navigate('/comptes');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const built = buildAccountInput(form);
    if ('error' in built) {
      setError(built.error);
      return;
    }
    setError(null);
    save.mutate(built.input);
  };

  const initialBalance = numOrNull(form.initial_balance) ?? 0;
  const preview = (amount: string, pct: string): string => {
    const value = resolveAmount(numOrNull(amount), numOrNull(pct), initialBalance);
    return value === null ? 'Non défini' : `Soit ${formatMoney(value, form.currency)}`;
  };

  return (
    <>
      <PageHeader
        title={account ? 'Modifier le compte' : 'Nouveau compte'}
        description="Renseigne uniquement les règles qui existent pour ce compte. Le montant est prioritaire sur le pourcentage."
        actions={
          <Link to="/comptes" className={buttonStyles('ghost')}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Card className="space-y-6">
          <SectionTitle title="Identité" />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Nom du compte *">
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ex. FTMO 100k – Phase 1"
                maxLength={80}
                required
              />
            </Field>
            <Field label="Type">
              <Select value={form.kind} onChange={(e) => set('kind', e.target.value as AccountKind)}>
                {ACCOUNT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Firme (prop firm)" hint="Laisse vide pour un compte personnel.">
              <Input list="firm-list" value={form.firm} onChange={(e) => set('firm', e.target.value)} placeholder="FTMO, Topstep…" />
              <datalist id="firm-list">
                {PROP_FIRMS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Field>
            <Field label="Plateforme">
              <Input
                list="platform-list"
                value={form.platform}
                onChange={(e) => set('platform', e.target.value)}
                placeholder="MetaTrader 5…"
              />
              <datalist id="platform-list">
                {PLATFORMS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field label="Statut">
              <Select value={form.status} onChange={(e) => set('status', e.target.value as AccountStatus)}>
                {ACCOUNT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="space-y-6">
          <SectionTitle title="Solde & devise" />
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Solde initial *" hint="Capital de départ du challenge ou du compte.">
              <Input
                inputMode="decimal"
                value={form.initial_balance}
                onChange={(e) => set('initial_balance', e.target.value)}
                placeholder="100000"
                required
              />
            </Field>
            <Field label="Devise">
              <Select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                {[...new Set([form.currency, ...CURRENCIES])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Fuseau de la journée"
              hint="Sert à découper les journées (perte journalière). Vérifie l’heure de reset de ta firme."
            >
              <Select value={form.day_timezone} onChange={(e) => set('day_timezone', e.target.value)}>
                {[...new Set([form.day_timezone, ...TIMEZONES])].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="space-y-6">
          <SectionTitle
            title="Règles de la prop firm"
            description="Laisse vide si la règle n’existe pas. Exemple : 5 % de perte journalière = 5 dans le champ %."
          />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Perte journalière max (montant)" hint={preview(form.daily_loss_amount, form.daily_loss_pct)}>
              <Input
                inputMode="decimal"
                value={form.daily_loss_amount}
                onChange={(e) => set('daily_loss_amount', e.target.value)}
                placeholder="ex. 5000"
              />
            </Field>
            <Field label="Perte journalière max (%)">
              <Input
                inputMode="decimal"
                value={form.daily_loss_pct}
                onChange={(e) => set('daily_loss_pct', e.target.value)}
                placeholder="ex. 5"
              />
            </Field>

            <Field label="Drawdown max (montant)" hint={preview(form.max_loss_amount, form.max_loss_pct)}>
              <Input
                inputMode="decimal"
                value={form.max_loss_amount}
                onChange={(e) => set('max_loss_amount', e.target.value)}
                placeholder="ex. 10000"
              />
            </Field>
            <Field label="Drawdown max (%)">
              <Input
                inputMode="decimal"
                value={form.max_loss_pct}
                onChange={(e) => set('max_loss_pct', e.target.value)}
                placeholder="ex. 10"
              />
            </Field>

            <Field
              label="Type de drawdown"
              hint="Statique : seuil fixe sous le solde initial. Trailing : seuil qui remonte avec le plus haut de l’équité, bloqué au solde initial."
            >
              <Select value={form.drawdown_type} onChange={(e) => set('drawdown_type', e.target.value as DrawdownType)}>
                <option value="static">Statique</option>
                <option value="trailing">Trailing</option>
              </Select>
            </Field>
            <Field label="Jours de trading minimum" hint="0 = aucune exigence.">
              <Input
                inputMode="numeric"
                value={form.min_trading_days}
                onChange={(e) => set('min_trading_days', e.target.value)}
              />
            </Field>

            <Field label="Objectif de profit (montant)" hint={preview(form.profit_target_amount, form.profit_target_pct)}>
              <Input
                inputMode="decimal"
                value={form.profit_target_amount}
                onChange={(e) => set('profit_target_amount', e.target.value)}
                placeholder="ex. 10000"
              />
            </Field>
            <Field label="Objectif de profit (%)">
              <Input
                inputMode="decimal"
                value={form.profit_target_pct}
                onChange={(e) => set('profit_target_pct', e.target.value)}
                placeholder="ex. 10"
              />
            </Field>

            <Field label="Règle de cohérence (%)" hint="Part maximale du profit total réalisée sur le meilleur jour (ex. 30 ou 50).">
              <Input
                inputMode="decimal"
                value={form.consistency_pct}
                onChange={(e) => set('consistency_pct', e.target.value)}
                placeholder="ex. 30"
              />
            </Field>
          </div>
        </Card>

        {error && (
          <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        )}

        <div className="sticky bottom-20 z-10 flex justify-end gap-2 rounded-2xl border border-line-2 bg-surface/95 p-3 shadow-card backdrop-blur-xl md:bottom-4">
          <Link to="/comptes" className={buttonStyles('ghost')}>
            Annuler
          </Link>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {account ? 'Enregistrer les modifications' : 'Créer le compte'}
          </Button>
        </div>
      </form>
    </>
  );
}
