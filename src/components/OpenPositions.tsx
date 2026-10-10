import { Link } from 'react-router-dom';
import type { Trade } from '../lib/types';
import { isOpen } from '../lib/metrics';
import { formatDateTime } from '../lib/format';
import { Badge, Card, PnlAmount, SectionTitle, cn } from './ui';

/** Durée écoulée depuis l'ouverture : « 3 h 20 », « 2 j 4 h », « moins d'une minute ». */
export function heldFor(openedAt: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(openedAt).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 1) return "moins d'une minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)} j ${hours % 24} h`;
}

/** Positions encore ouvertes, avec leur P&L flottant. Rien n'est affiché s'il n'y en a aucune. */
export function OpenPositions({
  trades,
  accountName,
  currencyOf,
  now,
  className,
}: {
  /** Trades du périmètre ; les positions clôturées sont ignorées. */
  trades: Trade[];
  accountName: (accountId: string) => string;
  currencyOf: (accountId: string) => string;
  now?: Date;
  className?: string;
}) {
  const open = trades.filter(isOpen);
  if (open.length === 0) return null;
  const floating = open.reduce((sum, t) => sum + t.net_pnl, 0);

  return (
    <Card className={cn('p-5', className)}>
      <SectionTitle
        title="Positions ouvertes"
        description="P&L flottant, tel que ta plateforme l'affiche. Il compte dans les limites de risque, pas dans les statistiques."
        action={
          <Badge tone={open.length > 0 ? 'accent' : 'neutral'}>
            {open.length} ouverte{open.length > 1 ? 's' : ''}
          </Badge>
        }
      />
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-xs text-muted">Total flottant</span>
        <PnlAmount value={floating} currency={currencyOf(open[0].account_id)} className="font-semibold" />
      </div>
      <ul className="-my-2 divide-y divide-line">
        {open.map((t) => (
          <li key={t.id}>
            <Link
              to={`/trades/${t.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-fg">{t.instrument}</span>
                  <Badge tone={t.direction === 'long' ? 'good' : 'bad'}>
                    {t.direction === 'long' ? 'Achat' : 'Vente'}
                  </Badge>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {accountName(t.account_id)} · ouverte depuis {heldFor(t.opened_at, now)} · {formatDateTime(t.opened_at)}
                </span>
              </span>
              <PnlAmount value={t.net_pnl} currency={currencyOf(t.account_id)} className="shrink-0 font-semibold" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
