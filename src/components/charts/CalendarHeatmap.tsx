import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthGrid, shiftMonth, type CalendarCell } from '../../lib/chartData';
import type { DayCell } from '../../lib/metrics';
import { capFirst, formatMoney, formatSignedCompact } from '../../lib/format';
import { usePalette } from '../PaletteContext';
import { cn } from '../ui';
import { LOSS_HATCH } from './shared';

const WEEK_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function monthTitle(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return capFirst(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1))));
}

function dayTitle(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * Calendrier mensuel : chaque jour de trading est coloré selon son P&L (gain, perte hachurée).
 * Cliquer sur un jour ouvre ses trades (onSelectDay).
 */
export function CalendarHeatmap({
  daily,
  initialMonth,
  currency,
  onSelectDay,
}: {
  daily: Map<string, DayCell>;
  initialMonth: string;
  currency: string;
  onSelectDay?: (date: string) => void;
}) {
  const { gainRgb, lossRgb } = usePalette();
  const [month, setMonth] = useState(initialMonth);
  const weeks = useMemo(() => monthGrid(month, daily), [month, daily]);
  const cells = weeks.flat().filter((c): c is CalendarCell => c !== null);
  const maxAbs = Math.max(1, ...cells.map((c) => Math.abs(c.pnl)));
  const monthPnl = cells.reduce((sum, c) => sum + c.pnl, 0);
  const monthCount = cells.reduce((sum, c) => sum + c.count, 0);

  const paint = (c: CalendarCell): CSSProperties => {
    if (c.pnl === 0) return { backgroundColor: 'rgb(125 136 153 / 0.35)' };
    const alpha = (0.22 + 0.7 * (Math.abs(c.pnl) / maxAbs)).toFixed(2);
    if (c.pnl > 0) return { backgroundColor: `rgb(${gainRgb} / ${alpha})` };
    return { backgroundColor: `rgb(${lossRgb} / ${alpha})`, backgroundImage: LOSS_HATCH };
  };

  const base = 'flex h-14 flex-col items-start justify-between rounded-lg p-1.5 text-left md:h-16';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Mois précédent"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="grid h-10 w-10 place-items-center rounded-lg border border-line-2 text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-0 text-center">
          <div className="text-sm font-semibold text-fg">{monthTitle(month)}</div>
          <div className="text-xs text-muted">
            {monthCount} trade(s) · <span className="tabular-nums text-fg-2">{formatMoney(monthPnl, currency, true)}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Mois suivant"
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="grid h-10 w-10 place-items-center rounded-lg border border-line-2 text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={`Jours de ${monthTitle(month)}`}>
        {WEEK_SHORT.map((label) => (
          <div key={label} className="pb-1 text-center text-[11px] font-medium text-muted" aria-hidden>
            {label}
          </div>
        ))}
        {weeks.flat().map((c, i) => {
          if (c === null) return <div key={`blank-${i}`} aria-hidden />;
          if (c.count === 0) {
            return (
              <div key={c.date} className={cn(base, 'border border-line bg-surface-2/40 text-muted')}>
                <span className="text-[11px] tabular-nums">{c.day}</span>
              </div>
            );
          }
          const label = `${capFirst(dayTitle(c.date))} : ${c.count} trade(s), ${formatMoney(c.pnl, currency, true)}`;
          const content = (
            <>
              <span className="text-[11px] font-medium tabular-nums text-fg">{c.day}</span>
              <span className="w-full truncate text-[11px] tabular-nums text-fg">{formatSignedCompact(c.pnl)}</span>
            </>
          );
          if (!onSelectDay) {
            return (
              <div key={c.date} aria-label={label} className={base} style={paint(c)}>
                {content}
              </div>
            );
          }
          return (
            <button
              key={c.date}
              type="button"
              aria-label={`${label}. Ouvrir les trades de ce jour`}
              title={label}
              onClick={() => onSelectDay(c.date)}
              className={cn(base, 'cursor-pointer transition-transform duration-150 hover:scale-[1.04]')}
              style={paint(c)}
            >
              {content}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: `rgb(${gainRgb} / 0.8)` }} aria-hidden />
          Gain
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: `${LOSS_HATCH}, rgb(${lossRgb} / 0.8)` }} aria-hidden />
          Perte (hachurée)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-line bg-surface-2" aria-hidden />
          Aucun trade
        </span>
      </div>
    </div>
  );
}
