import type { Account } from '../lib/types';
import type { Gauge, Level, RuleReport } from '../lib/rules';
import { formatMoney, formatNumber, formatPercent } from '../lib/format';
import { Badge, Card, ProgressBar, PnlAmount, cn, type Tone } from './ui';

export const LEVEL_UI: Record<Level, { label: string; tone: Tone; bar: string; text: string }> = {
  ok: { label: 'Dans les règles', tone: 'good', bar: 'bg-gain', text: 'text-gain' },
  warning: { label: 'Attention', tone: 'warn', bar: 'bg-accent', text: 'text-accent-hi' },
  danger: { label: 'Danger', tone: 'hot', bar: 'bg-danger', text: 'text-danger' },
  breached: { label: 'Règle enfreinte', tone: 'bad', bar: 'bg-loss', text: 'text-loss' },
};

const KIND_LABEL: Record<Account['kind'], string> = {
  personal: 'Personnel',
  evaluation: 'Challenge',
  funded: 'Financé',
};

/** Montant formaté selon l’unité de la règle. */
function amount(g: Gauge, value: number, currency: string): string {
  if (g.unit === 'money') return formatMoney(value, currency);
  if (g.unit === 'percent') return formatPercent(value);
  return `${formatNumber(value, 0)} jour(s)`;
}

/** Seuil, limite ou objectif de la règle. */
function limitText(g: Gauge, currency: string): string {
  if (g.key === 'days') return `minimum ${amount(g, g.limit, currency)}`;
  if (g.kind === 'progress') return `objectif ${amount(g, g.limit, currency)}`;
  return `${g.unit === 'percent' ? 'max' : 'limite'} ${amount(g, g.limit, currency)}`;
}

/** Marge restante, ou ce qu’il reste à faire pour atteindre l’objectif. */
function remainingText(g: Gauge, currency: string): string {
  if (g.remaining === null) return '';
  if (g.key === 'target') return g.remaining > 0 ? `reste ${amount(g, g.remaining, currency)}` : 'objectif atteint';
  if (g.key === 'days') return g.remaining > 0 ? `encore ${amount(g, g.remaining, currency)}` : 'minimum atteint';
  return g.remaining > 0 ? `marge ${amount(g, g.remaining, currency)}` : `dépassé de ${amount(g, -g.remaining, currency)}`;
}

/** Libellé d’une jauge : les limites de perte portent le nom que lit le trader (marge avant la limite). */
function gaugeLabel(g: Gauge): string {
  if (g.key === 'maxLoss') return 'Marge avant drawdown limite';
  if (g.key === 'daily') return 'Marge avant perte journalière';
  return g.label;
}

/**
 * Une règle avec sa jauge animée, son niveau et la marge restante en $.
 * En zone de danger ou enfreinte, la barre pulse doucement (opacité seule).
 */
export function GaugeRow({ gauge, currency }: { gauge: Gauge; currency: string }) {
  const ui = LEVEL_UI[gauge.level];
  const isRisk = gauge.kind === 'risk';
  const danger = isRisk && (gauge.level === 'danger' || gauge.level === 'breached');
  const headline =
    isRisk && gauge.remaining !== null
      ? gauge.remaining >= 0
        ? `${amount(gauge, gauge.remaining, currency)} de marge`
        : `dépassé de ${amount(gauge, -gauge.remaining, currency)}`
      : amount(gauge, gauge.value, currency);
  const details = isRisk
    ? `utilisé ${amount(gauge, gauge.value, currency)} · ${limitText(gauge, currency)}`
    : [limitText(gauge, currency), remainingText(gauge, currency)].filter(Boolean).join(' · ');
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-[13px] text-fg-2">{gaugeLabel(gauge)}</span>
        <span className={cn('shrink-0 text-[13px] font-semibold tabular-nums', isRisk && gauge.level !== 'ok' ? ui.text : 'text-fg')}>
          {headline}
        </span>
      </div>
      <ProgressBar ratio={gauge.ratio} className={gauge.kind === 'progress' ? 'bg-info' : ui.bar} pulse={danger} />
      {details && <div className="text-xs leading-relaxed text-muted">{details}</div>}
    </div>
  );
}

export function RuleCard({ account, report }: { account: Account; report: RuleReport }) {
  const overall = LEVEL_UI[report.overall];
  const currency = account.currency;

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-fg">{account.name}</div>
          <div className="mt-0.5 text-[13px] text-muted">
            {account.firm ? `${account.firm} · ` : ''}
            {KIND_LABEL[account.kind]}
          </div>
        </div>
        <Badge tone={overall.tone}>{overall.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
        <div className="bg-surface-2/60 p-3.5">
          <div className="text-xs text-muted">Équité</div>
          <div className="mt-1 font-semibold tabular-nums text-fg">{formatMoney(report.equity, currency)}</div>
        </div>
        <div className="bg-surface-2/60 p-3.5">
          <div className="text-xs text-muted">P&amp;L du jour</div>
          <div className="mt-1 font-semibold tabular-nums">
            <PnlAmount value={report.todayPnl} currency={currency} />
          </div>
        </div>
      </div>

      {report.gauges.length > 0 && (
        <div className="space-y-4">
          {report.gauges.map((g) => (
            <GaugeRow key={g.key} gauge={g} currency={currency} />
          ))}
        </div>
      )}

      {report.alerts.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-accent/20 bg-accent/5 p-3.5 text-[13px] text-accent-hi">
          {report.alerts.map((alert) => (
            <li key={alert} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{alert}</span>
            </li>
          ))}
        </ul>
      )}

      {!report.hasRules && (
        <p className="text-xs leading-relaxed text-muted">
          Aucune règle configurée. Ajoute les règles de la firme dans les paramètres du compte.
        </p>
      )}
    </Card>
  );
}
