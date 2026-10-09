import { useConfirm } from '../components/ConfirmDialog';
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Trash2, Upload } from 'lucide-react';
import { useAccounts, useBatches, useRefresh, useRepo, useTrades } from '../data/hooks';
import { IMPORT_SOURCES, TIMEZONES } from '../lib/constants';
import {
  MAPPING_FIELDS,
  decodeFileBuffer,
  emptyMapping,
  guessMapping,
  parseCsv,
  rowsToTrades,
  type ColumnMapping,
  type DateOrder,
  type ImportResult,
  type ParsedCsv,
} from '../lib/csv';
import { parseMt5Html } from '../lib/mt5';
import { formatDateTime, formatMoney, formatNumber, signClass } from '../lib/format';
import type { ImportSource } from '../lib/types';
import { errorMessage, useToast } from '../components/Toast';
import { Badge, Button, Card, EmptyState, Field, Loading, PageHeader, Select, SectionTitle, cn } from '../components/ui';

const SOURCE_KEYS = Object.keys(IMPORT_SOURCES) as ImportSource[];

const DATE_ORDERS: { value: DateOrder; label: string }[] = [
  { value: 'auto', label: 'Automatique' },
  { value: 'dmy', label: 'Jour / mois / année' },
  { value: 'mdy', label: 'Mois / jour / année' },
  { value: 'ymd', label: 'Année / mois / jour' },
];

function Steps({ steps }: { steps: { label: string; done: boolean }[] }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Étapes de l’import">
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={cn(
            'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors duration-300',
            s.done ? 'border-gain/25 bg-gain/5 text-fg' : i === current ? 'border-accent/35 bg-accent/5 text-fg' : 'border-line-2 text-muted',
          )}
        >
          <span
            className={cn(
              'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
              s.done ? 'bg-gain text-ink' : i === current ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-muted',
            )}
          >
            {s.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
          </span>
          <span className="truncate">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line-2 bg-surface-2/50 p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn('mt-1 text-xl font-semibold tabular-nums', tone ?? 'text-fg')}>{value}</div>
    </div>
  );
}

export default function ImportPage() {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: trades, isLoading: loadingTrades } = useTrades();
  const { data: batches, isLoading: loadingBatches } = useBatches();

  const [accountId, setAccountId] = useState('');
  const [source, setSource] = useState<ImportSource>('mt5');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping());
  const [timezone, setTimezone] = useState<string>(IMPORT_SOURCES.mt5.timezone);
  const [dateOrder, setDateOrder] = useState<DateOrder>(IMPORT_SOURCES.mt5.dateOrder);
  const [pnlIsNet, setPnlIsNet] = useState(false);
  const [reading, setReading] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const accountList = accounts ?? [];
  const effectiveAccountId = accountId || accountList[0]?.id || '';

  // Analyse du fichier : recalculée seulement quand les réglages changent
  const result = useMemo<ImportResult | null>(() => {
    if (!effectiveAccountId) return null;
    if (source === 'mt5') {
      return rawText === null ? null : parseMt5Html(rawText, effectiveAccountId, timezone);
    }
    if (!csv) return null;
    return rowsToTrades(csv, { mapping, timezone, dateOrder, pnlIsNet }, effectiveAccountId);
  }, [source, rawText, csv, mapping, timezone, dateOrder, pnlIsNet, effectiveAccountId]);

  // Doublons : positions déjà importées pour ce compte (même identifiant externe)
  const existingIds = useMemo(
    () =>
      new Set(
        (trades ?? [])
          .filter((t) => t.account_id === effectiveAccountId)
          .map((t) => t.external_id)
          .filter((id): id is string => Boolean(id)),
      ),
    [trades, effectiveAccountId],
  );

  const toImport = result ? result.trades.filter((t) => !t.external_id || !existingIds.has(t.external_id)) : [];
  const duplicates = result ? result.trades.length - toImport.length : 0;
  const currency = accountList.find((a) => a.id === effectiveAccountId)?.currency ?? 'USD';

  const resetFile = () => {
    setFileName(null);
    setRawText(null);
    setCsv(null);
    setMapping(emptyMapping());
    setInputKey((k) => k + 1);
  };

  const changeSource = (next: ImportSource) => {
    setSource(next);
    setTimezone(IMPORT_SOURCES[next].timezone);
    setDateOrder(IMPORT_SOURCES[next].dateOrder);
    setPnlIsNet(false);
    resetFile();
  };

  const onFile = async (file: File | undefined) => {
    setFileName(null);
    setRawText(null);
    setCsv(null);
    if (!file) return;
    setReading(true);
    try {
      const text = decodeFileBuffer(await file.arrayBuffer());
      if (source === 'mt5') {
        setRawText(text);
      } else {
        const parsed = parseCsv(text);
        if (parsed.headers.length === 0) throw new Error('Fichier vide ou sans en-têtes de colonnes.');
        setCsv(parsed);
        setMapping(guessMapping(parsed.headers));
      }
      setFileName(file.name);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setReading(false);
    }
  };

  const runImport = useMutation({
    mutationFn: async () => {
      if (!result || toImport.length === 0) throw new Error('Aucun trade à importer.');
      const batch = await repo.createImportBatch({
        account_id: effectiveAccountId,
        source,
        filename: fileName,
        rows_total: result.total,
        rows_imported: toImport.length,
        rows_skipped: Math.max(0, result.total - toImport.length),
      });
      try {
        await repo.insertTrades(toImport.map((t) => ({ ...t, import_batch_id: batch.id })));
      } catch (err) {
        await repo.deleteImportBatch(batch.id).catch(() => undefined);
        throw err;
      }
      return toImport.length;
    },
    onSuccess: async (count) => {
      await refresh();
      toast.show(`${count} trade(s) importé(s)`);
      resetFile();
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const deleteBatch = useMutation({
    mutationFn: (id: string) => repo.deleteImportBatch(id),
    onSuccess: async () => {
      await refresh();
      toast.show('Import annulé : ses trades ont été supprimés');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  if (loadingAccounts || loadingTrades || loadingBatches) return <Loading />;

  if (accountList.length === 0) {
    return (
      <>
        <PageHeader title="Import de trades" />
        <EmptyState
          icon={<Upload className="h-5 w-5" aria-hidden />}
          title="Crée d’abord un compte"
          description="Les trades importés sont rattachés à un compte."
        />
      </>
    );
  }

  const info = IMPORT_SOURCES[source];
  const batchList = batches ?? [];
  const steps = [
    { label: 'Compte & source', done: Boolean(effectiveAccountId) },
    { label: 'Fichier', done: fileName !== null },
    { label: 'Vérification', done: result !== null },
    { label: 'Import', done: runImport.isSuccess },
  ];

  return (
    <>
      <PageHeader
        title="Import de trades"
        description="Importe ton historique depuis ta plateforme. Les doublons sont ignorés automatiquement."
      />

      <div className="space-y-5">
        <Steps steps={steps} />

        <Card className="space-y-6">
          <SectionTitle title="Compte et plateforme" />
          <Field label="Compte de destination" className="md:max-w-md">
            <Select value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
              {accountList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="space-y-2.5">
            <span className="block text-[13px] font-medium text-fg-2">Plateforme</span>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {SOURCE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeSource(key)}
                  aria-pressed={source === key}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-300 ease-out-expo active:scale-[0.99]',
                    source === key
                      ? 'border-accent/45 bg-accent/[0.07] text-fg shadow-lg shadow-accent/5'
                      : 'border-line-2 bg-surface-2/40 text-fg-2 hover:border-muted/40',
                  )}
                >
                  <span className="text-sm font-medium">{IMPORT_SOURCES[key].label}</span>
                  <span
                    className={cn('h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-300', source === key ? 'bg-accent' : 'bg-line-2')}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          </div>
          <p className="rounded-xl border border-line-2 bg-surface-2/50 p-4 text-[13px] leading-relaxed text-muted">{info.help}</p>
        </Card>

        <Card className="space-y-5">
          <SectionTitle
            title="Fichier"
            description={source === 'mt5' ? 'Rapport HTML exporté depuis MetaTrader 5.' : 'Fichier CSV exporté depuis la plateforme.'}
          />
          <label
            className={cn(
              'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center transition-colors duration-300 focus-within:ring-4 focus-within:ring-accent/10',
              reading && 'pointer-events-none opacity-60',
              fileName ? 'border-gain/40 bg-gain/[0.04]' : 'border-line-2 bg-surface-2/30 hover:border-accent/50 hover:bg-accent/[0.03]',
            )}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line-2 bg-surface-2 text-accent transition-transform duration-300 group-hover:-translate-y-0.5">
              <Upload className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-sm font-medium text-fg">
              {reading ? 'Lecture du fichier…' : fileName ? fileName : 'Glisse ton fichier ici ou clique pour le choisir'}
            </span>
            <span className="text-xs text-muted">{source === 'mt5' ? 'Rapport HTML (.html, .htm)' : 'Fichier CSV (.csv, .txt)'}</span>
            <input
              key={inputKey}
              type="file"
              accept={info.accept}
              aria-label="Fichier à importer"
              disabled={reading}
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="sr-only"
            />
          </label>
        </Card>

        {(csv || source === 'mt5') && (
          <Card className="space-y-6">
            <SectionTitle title="Réglages" description="Fuseau et format de date du fichier. Vérifie-les avant d’importer." />
            <div className="grid items-end gap-5 md:grid-cols-3">
              <Field label="Fuseau horaire du fichier" hint="Les heures du fichier sont converties en UTC à partir de ce fuseau.">
                <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {[...new Set([timezone, ...TIMEZONES])].map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </Field>
              {source !== 'mt5' && (
                <>
                  <Field label="Format des dates">
                    <Select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)}>
                      {DATE_ORDERS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <label className="flex items-center gap-3 pb-2.5 text-sm text-fg-2">
                    <input
                      type="checkbox"
                      checked={pnlIsNet}
                      onChange={(e) => setPnlIsNet(e.target.checked)}
                      className="h-4 w-4 accent-accent"
                    />
                    La colonne P&amp;L est déjà nette (frais inclus)
                  </label>
                </>
              )}
            </div>
          </Card>
        )}

        {csv && source !== 'mt5' && (
          <Card className="space-y-6">
            <SectionTitle
              title="Correspondance des colonnes"
              description={`${csv.rows.length} ligne(s) détectée(s). Vérifie que chaque champ pointe vers la bonne colonne.`}
            />
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {MAPPING_FIELDS.map((f) => (
                <Field key={f.key} label={f.required ? `${f.label} *` : f.label}>
                  <Select value={mapping[f.key]} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
                    <option value="">— Non mappé —</option>
                    {csv.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </Card>
        )}

        {result && (
          <Card className="space-y-6">
            <SectionTitle title="Aperçu" description="Rien n’est enregistré avant que tu cliques sur « Importer »." />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Mini label="Positions lues" value={formatNumber(result.total, 0)} />
              <Mini label="À importer" value={formatNumber(toImport.length, 0)} tone="text-gain" />
              <Mini label="Doublons ignorés" value={formatNumber(duplicates, 0)} />
              <Mini
                label="Erreurs"
                value={formatNumber(result.errors.length, 0)}
                tone={result.errors.length ? 'text-accent' : undefined}
              />
            </div>

            {result.errors.length > 0 && (
              <details className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-xs text-accent-hi">
                <summary className="cursor-pointer font-medium">
                  {result.errors.length} ligne(s) ignorée(s) : voir le détail
                </summary>
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                  {result.errors.slice(0, 50).map((err, i) => (
                    <li key={`${err}-${i}`}>• {err}</li>
                  ))}
                </ul>
              </details>
            )}

            {toImport.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-line-2">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-line bg-surface-2/60 text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Ouverture</th>
                      <th className="px-3 py-2.5 font-medium">Instrument</th>
                      <th className="px-3 py-2.5 font-medium">Sens</th>
                      <th className="px-3 py-2.5 text-right font-medium">Taille</th>
                      <th className="px-3 py-2.5 text-right font-medium">P&amp;L brut</th>
                      <th className="px-3 py-2.5 text-right font-medium">Frais</th>
                      <th className="px-3 py-2.5 text-right font-medium">P&amp;L net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {toImport.slice(0, 10).map((t, i) => {
                      const net = t.gross_pnl - t.fees;
                      return (
                        <tr key={`${t.external_id ?? i}-${i}`}>
                          <td className="whitespace-nowrap px-3 py-2.5 text-fg-2">{formatDateTime(t.opened_at)}</td>
                          <td className="px-3 py-2.5 font-medium text-fg">{t.instrument}</td>
                          <td className="px-3 py-2.5">
                            <Badge tone={t.direction === 'long' ? 'good' : 'bad'}>{t.direction === 'long' ? 'Achat' : 'Vente'}</Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted">{t.size ?? '—'}</td>
                          <td className={cn('px-3 py-2.5 text-right tabular-nums', signClass(t.gross_pnl))}>
                            {formatMoney(t.gross_pnl, currency, true)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted">{formatMoney(t.fees, currency)}</td>
                          <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', signClass(net))}>
                            {formatMoney(net, currency, true)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {toImport.length > 10 && (
                  <p className="px-3 py-2.5 text-xs text-muted">… et {toImport.length - 10} autre(s) trade(s)</p>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                variant="primary"
                disabled={toImport.length === 0}
                loading={runImport.isPending}
                onClick={() => runImport.mutate()}
              >
                <Upload className="h-4 w-4" aria-hidden />
                Importer {toImport.length} trade(s)
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <SectionTitle title="Imports précédents" description="Annuler un import supprime les trades qu’il a créés." />
          {batchList.length === 0 ? (
            <p className="text-sm text-muted">Aucun import pour l’instant.</p>
          ) : (
            <ul className="divide-y divide-line">
              {batchList.map((b) => {
                const acc = accountList.find((a) => a.id === b.account_id);
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-fg">
                        {IMPORT_SOURCES[b.source].label} · {b.filename ?? 'fichier'}
                      </div>
                      <div className="text-xs text-muted">
                        {formatDateTime(b.created_at)} · {acc?.name ?? 'Compte supprimé'} · {b.rows_imported} importé(s)
                        {b.rows_skipped > 0 ? `, ${b.rows_skipped} ignoré(s)` : ''}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-loss hover:text-loss"
                      loading={deleteBatch.isPending && deleteBatch.variables === b.id}
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Annuler cet import ?',
                          description: 'Tous les trades créés par cet import seront supprimés.',
                          confirmLabel: 'Supprimer les trades',
                          danger: true,
                        });
                        if (ok) deleteBatch.mutate(b.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Annuler l’import
                    </Button>
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
