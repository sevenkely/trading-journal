import { useMemo, useState } from 'react';
import type { Account, Trade } from '../lib/types';
import { computeStats, tradeTime } from '../lib/metrics';
import { compareStats, summarizeCompare, type CompareRow, type CompareSide } from '../lib/compare';
import { formatDate, formatMoney, formatNumber, formatPercent, formatProfitFactor, formatR } from '../lib/format';
import { usePalette } from './PaletteContext';
import { Card, PnlAmount, SectionTitle, Segmented, Select, cn } from './ui';

const DAY_MS = 86_400_000;

type Mode = 'periodes' | 'comptes';

const MODES: { value: Mode; label: string }[] = [
  { value: 'periodes', label: 'Deux périodes' },
  { value: 'comptes', label: 'Deux comptes' },
];

/** Fenêtres proposées : la période de comparaison est celle qui précède, de même durée. */
const WINDOWS: { value: number; label: string }[] = [
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '90 jours' },
  { value: 365, label: '12 mois' },
];

/** Écart signé lisible : « +12,4 », « −3 » (le signe disparaît pour zéro). */
function signed(value: number, digits: number): string {
  const text = formatNumber(Math.abs(value), digits);
  if (value === 0) return text;
  return `${value > 0 ? '+' : '−'}${text}`;
}

/** Date courte, avec l’année seulement quand elle n’est pas celle en cours : « 10 oct. 2025 », « 10 oct. ». */
function stamp(ms: number, currentYear: number): string {
  const date = new Date(ms);
  const options: Intl.DateTimeFormatOptions =
    date.getUTCFullYear() === currentYear
      ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
      : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  return formatDate(date, options);
}

function sideValue(row: CompareRow, value: number | null, currency: string) {
  const readable = value !== null && (Number.isFinite(value) || (row.format === 'factor' && value === Infinity));
  if (!readable || value === null) return <span className="text-muted">—</span>;
  switch (row.format) {
    case 'money':
      return <PnlAmount value={value} currency={currency} className="font-semibold" />;
    case 'percent':
      return <span className="tabular-nums text-fg-2">{formatPercent(value)}</span>;
    case 'factor':
      return <span className="tabular-nums text-fg-2">{formatProfitFactor(value)}</span>;
    case 'r':
      return <span className="tabular-nums text-fg-2">{formatR(value)}</span>;
    default:
      return <span className="tabular-nums text-fg-2">{formatNumber(value, 0)}</span>;
  }
}

function deltaText(row: CompareRow, currency: string): string | null {
  if (row.delta === null) return null;
  switch (row.format) {
    case 'money':
      return formatMoney(row.delta, currency, true);
    case 'percent':
      return `${signed(row.delta, 1)} pt`;
    case 'factor':
      return signed(row.delta, 2);
    case 'r':
      return `${signed(row.delta, 2)} R`;
    default:
      return signed(row.delta, 0);
  }
}

/** Progrès (true), recul (false), ou rien quand l’indicateur n’a pas de sens de lecture. */
function improved(row: CompareRow): boolean | null {
  if (row.delta === null || row.delta === 0 || row.higherIsBetter === null) return null;
  return row.delta > 0 === row.higherIsBetter;
}

/** Une moitié du bandeau : le nom du périmètre, sa fenêtre, son P&L net et une barre proportionnelle. */
function SideHead({ side, range, maxAbs, currency }: { side: CompareSide; range: string; maxAbs: number; currency: string }) {
  const { gainRgb, lossRgb } = usePalette();
  const pnl = side.stats.netPnl;
  const share = maxAbs === 0 ? 0 : Math.abs(pnl) / maxAbs;
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
      <div className="text-[13px] font-medium text-fg">{side.label}</div>
      <div className="mt-0.5 text-xs text-muted">{range}</div>
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <PnlAmount value={pnl} currency={currency} className="text-lg font-semibold" />
        <span className="shrink-0 text-xs tabular-nums text-muted">{side.stats.count} trade(s)</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(2, share * 100)}%`, background: `rgb(${pnl >= 0 ? gainRgb : lossRgb})` }}
        />
      </div>
    </div>
  );
}

/**
 * Comparaison côte à côte : deux fenêtres consécutives de même durée (le progrès dans le temps),
 * ou deux comptes sur la même période. Chaque indicateur est affiché des deux côtés avec son écart.
 */
export function ComparePanel({
  trades,
  accounts,
  tz,
  currency,
  periods,
}: {
  trades: Trade[];
  accounts: Account[];
  tz: string;
  /** Devise d’affichage, héritée de la page (les écarts n’ont de sens qu’entre montants comparables). */
  currency: string;
  periods: { value: number; label: string }[];
}) {
  const active = useMemo(() => accounts.filter((a) => a.status !== 'archived'), [accounts]);
  const canCompareAccounts = active.length >= 2;

  const [mode, setMode] = useState<Mode>('periodes');
  const [periodAccount, setPeriodAccount] = useState('all');
  const [windowDays, setWindowDays] = useState(7);
  // Par défaut, les deux premiers comptes actifs : c’est la comparaison la plus parlante
  const [accountA, setAccountA] = useState(() => active[0]?.id ?? 'all');
  const [accountB, setAccountB] = useState(() => active[1]?.id ?? 'all');
  const [days, setDays] = useState(0);
  const currencyOf = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);

  // Instant de référence figé au montage : les fenêtres ne glissent pas à chaque rendu.
  const [now] = useState(() => Date.now());
  const currentYear = new Date(now).getUTCFullYear();
  const scope = useMemo(() => {
    const byAccount = (list: Trade[], id: string) => (id === 'all' ? list : list.filter((t) => t.account_id === id));
    const currenciesOf = (list: Trade[]) => new Set(list.map((t) => currencyOf.get(t.account_id) ?? currency));

    if (mode === 'comptes') {
      const cutoff = days > 0 ? now - days * DAY_MS : Number.NEGATIVE_INFINITY;
      const window = trades.filter((t) => new Date(tradeTime(t)).getTime() >= cutoff);
      const name = (id: string) => (id === 'all' ? 'Tous les comptes' : accounts.find((a) => a.id === id)?.name ?? '—');
      const range = days > 0 ? `depuis le ${stamp(cutoff, currentYear)}` : 'tout l’historique';
      const sideA = byAccount(window, accountA);
      const sideB = byAccount(window, accountB);
      return {
        a: { label: name(accountA), stats: computeStats(sideA, tz) },
        b: { label: name(accountB), stats: computeStats(sideB, tz) },
        rangeA: range,
        rangeB: range,
        mixed: new Set([...currenciesOf(sideA), ...currenciesOf(sideB)]).size > 1,
        phrase: `pour ${name(accountB)}`,
      };
    }

    // Deux fenêtres consécutives : la précédente, puis la même durée jusqu’à maintenant.
    const duration = windowDays * DAY_MS;
    const current = trades.filter((t) => new Date(tradeTime(t)).getTime() >= now - duration);
    const previous = trades.filter((t) => {
      const ms = new Date(tradeTime(t)).getTime();
      return ms >= now - 2 * duration && ms < now - duration;
    });
    const range = (from: number, to: number) => `${stamp(from, currentYear)} – ${stamp(to, currentYear)}`;
    return {
      a: { label: 'Période précédente', stats: computeStats(byAccount(previous, periodAccount), tz) },
      b: { label: 'Période actuelle', stats: computeStats(byAccount(current, periodAccount), tz) },
      rangeA: range(now - 2 * duration, now - duration),
      rangeB: range(now - duration, now),
      mixed: currenciesOf(byAccount(current, periodAccount)).size > 1,
      phrase: 'sur la période actuelle',
    };
  }, [mode, trades, accounts, tz, now, days, windowDays, periodAccount, accountA, accountB, currency, currencyOf]);

  const { a, b, rangeA, rangeB, mixed, phrase } = scope;
  const rows = compareStats(a.stats, b.stats);
  const summary = summarizeCompare(rows);
  const maxAbs = Math.max(Math.abs(a.stats.netPnl), Math.abs(b.stats.netPnl));
  const empty = a.stats.count === 0 && b.stats.count === 0;
  // Un écart n’a de sens que si les deux côtés ont des trades : sinon il compare un vide à un résultat
  const comparable = a.stats.count > 0 && b.stats.count > 0;

  return (
    <Card className="p-5 md:p-6">
      <SectionTitle
        title="Comparer"
        description="Deux fenêtres de temps, ou deux comptes, côte à côte. Un état se mesure, un progrès se compare."
      />

      <div className="mb-5 flex flex-wrap items-end gap-x-5 gap-y-4">
        {canCompareAccounts && (
          <Segmented id="compare-mode" label="Type de comparaison" options={MODES} value={mode} onChange={setMode} />
        )}

        {mode === 'periodes' ? (
          <>
            <div>
              <div className="mb-1.5 text-[13px] text-muted">Compte</div>
              <Select value={periodAccount} onChange={(e) => setPeriodAccount(e.target.value)} aria-label="Compte comparé" className="min-w-44">
                <option value="all">Tous les comptes</option>
                {active.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] text-muted">Durée de chaque fenêtre</div>
              <Segmented id="compare-window" label="Durée de chaque fenêtre" options={WINDOWS} value={windowDays} onChange={setWindowDays} />
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="mb-1.5 text-[13px] text-muted">Période</div>
              <Segmented id="compare-period" label="Période comparée" options={periods} value={days} onChange={setDays} />
            </div>
            <div>
              <div className="mb-1.5 text-[13px] text-muted">Compte</div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={accountA} onChange={(e) => setAccountA(e.target.value)} aria-label="Premier compte" className="min-w-40">
                  <option value="all">Tous les comptes</option>
                  {active.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-muted" aria-hidden>
                  contre
                </span>
                <Select value={accountB} onChange={(e) => setAccountB(e.target.value)} aria-label="Second compte" className="min-w-40">
                  <option value="all">Tous les comptes</option>
                  {active.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </>
        )}
      </div>

      {mixed && (
        <p className="mb-4 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-xs leading-relaxed text-accent-hi">
          Devises différentes dans la comparaison : les montants sont additionnés sans conversion. Filtre sur un compte
          pour une lecture exacte.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <SideHead side={a} range={rangeA} maxAbs={maxAbs} currency={currency} />
        <SideHead side={b} range={rangeB} maxAbs={maxAbs} currency={currency} />
      </div>

      {empty ? (
        <p className="mt-4 text-sm text-muted">Aucun trade dans l’un ou l’autre périmètre : élargis la comparaison.</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-fg-2">
            {!comparable ? (
              <span className="text-muted">
                Un des deux périmètres ne contient aucun trade : les valeurs se lisent, mais l’écart n’a rien à comparer.
                Élargis la fenêtre ou choisis une autre période.
              </span>
            ) : summary.pnlDelta === 0 ? (
              'P&L net identique sur les deux périmètres.'
            ) : (
              <>
                Le P&L net {summary.pnlDelta > 0 ? 'progresse' : 'recule'} de{' '}
                <span className={cn('font-medium tabular-nums', summary.pnlDelta > 0 ? 'text-gain' : 'text-loss')}>
                  {formatMoney(Math.abs(summary.pnlDelta), currency)}
                </span>{' '}
                {phrase}.
              </>
            )}{' '}
            {comparable && summary.improved + summary.regressed > 0 && (
              <span className="text-muted">
                {summary.improved} indicateur(s) en progrès, {summary.regressed} en recul.
              </span>
            )}
          </p>

          <div className="-mx-5 mt-4 overflow-x-auto md:-mx-6">
            <table className="w-full text-sm md:min-w-[520px]">
              <caption className="sr-only">
                Comparaison indicateur par indicateur entre {a.label} ({rangeA}) et {b.label} ({rangeB}). L’écart affiché est
                celui de la seconde colonne moins la première.
              </caption>
              <thead className="border-y border-line bg-surface-2/50 text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium md:px-6">
                    Indicateur
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    {a.label}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    {b.label}
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium md:px-6">
                    Écart
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => {
                  const better = comparable ? improved(row) : null;
                  const text = comparable ? deltaText(row, currency) : null;
                  const rising = (row.delta ?? 0) > 0;
                  return (
                    <tr key={row.key} className="transition-colors hover:bg-surface-2/50">
                      <th scope="row" className="px-5 py-3 text-left font-normal text-fg-2 md:px-6">
                        {row.label}
                      </th>
                      <td className="px-3 py-3 text-right">{sideValue(row, row.a, currency)}</td>
                      <td className="px-3 py-3 text-right">{sideValue(row, row.b, currency)}</td>
                      <td className="px-5 py-3 text-right tabular-nums md:px-6">
                        {text === null || row.delta === null ? (
                          <span className="text-muted">—</span>
                        ) : row.delta === 0 ? (
                          <span className="text-muted">{text}</span>
                        ) : (
                          <span className={cn(better === null ? 'text-fg-2' : cn('font-medium', better ? 'text-gain' : 'text-loss'))}>
                            <span aria-hidden className="mr-1 text-[0.8em]">
                              {rising ? '▲' : '▼'}
                            </span>
                            {better !== null && <span className="sr-only">{better ? 'progrès de ' : 'recul de '}</span>}
                            {text}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted">
            « Écart » = la seconde colonne moins la première. La flèche suit le sens de la valeur ; la couleur dit si c’est
            un progrès (vert) ou un recul (rouge) — un drawdown ou une série de pertes qui baisse compte comme un progrès.
            Le nombre de trades et de jours tradés est donné sans jugement.
          </p>
        </>
      )}
    </Card>
  );
}
