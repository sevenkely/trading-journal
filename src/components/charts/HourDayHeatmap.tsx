import { Fragment, useState, type CSSProperties } from 'react';
import { isThinCell, MIN_HEAT_SAMPLE } from '../../lib/chartData';
import { capFirst, formatMoney } from '../../lib/format';
import type { HeatCell } from '../../lib/patterns';
import { PnlAmount, cn } from '../ui';
import { usePalette } from '../PaletteContext';
import { LOSS_HATCH } from './shared';

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const WEEK_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/**
 * Carte jour de semaine × heure d’entrée, en heure de New York. Couleur et hachures selon le P&L,
 * chiffre = nombre de trades. Sous MIN_HEAT_SAMPLE trades, la case est grisée : l’échantillon ne suffit pas.
 */
export function HourDayHeatmap({ grid, currency }: { grid: Map<string, HeatCell>; currency: string }) {
  const { gainRgb, lossRgb } = usePalette();
  const [selected, setSelected] = useState<string | null>(null);
  const cells = [...grid.entries()];
  if (cells.length === 0) return <p className="text-sm text-muted">Aucun trade sur cette période.</p>;

  const hours = cells.map(([key]) => Number(key.split('-')[1]));
  const first = Math.min(...hours);
  const last = Math.max(...hours);
  const columns = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const maxAbs = Math.max(1, ...cells.map(([, c]) => Math.abs(c.pnl)));
  const thinCount = cells.filter(([, c]) => isThinCell(c)).length;

  const paint = (cell: HeatCell): CSSProperties => {
    if (cell.pnl === 0) return { backgroundColor: 'rgb(125 136 153 / 0.35)' };
    const alpha = (0.22 + 0.7 * (Math.abs(cell.pnl) / maxAbs)).toFixed(2);
    if (cell.pnl > 0) return { backgroundColor: `rgb(${gainRgb} / ${alpha})` };
    return { backgroundColor: `rgb(${lossRgb} / ${alpha})`, backgroundImage: LOSS_HATCH };
  };

  const describe = (day: number, hour: number, cell?: HeatCell): string => {
    const when = `${capFirst(WEEKDAYS[day])} ${hour} h (NY)`;
    if (!cell) return `${when} : aucun trade`;
    const thin = isThinCell(cell) ? `, échantillon insuffisant (moins de ${MIN_HEAT_SAMPLE} trades)` : '';
    return `${when} : ${cell.count} trade(s), ${formatMoney(cell.pnl, currency, true)}${thin}`;
  };

  const selectedCell = selected ? grid.get(selected) : undefined;
  const [selectedDay, selectedHour] = selected ? selected.split('-').map(Number) : [0, 0];
  const entries = cells
    .map(([key, c]) => {
      const [day, hour] = key.split('-').map(Number);
      return { key, day, hour, ...c };
    })
    .sort((a, b) => a.day - b.day || a.hour - b.hour);

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-max gap-1.5" style={{ gridTemplateColumns: `2.75rem repeat(${columns.length}, minmax(2.25rem, 1fr))` }}>
          <div />
          {columns.map((h) => (
            <div key={h} className="text-center text-[11px] tabular-nums text-muted">
              {h}h
            </div>
          ))}
          {WEEK_SHORT.map((label, day) => (
            <Fragment key={label}>
              <div className="flex items-center text-xs text-muted">{label}</div>
              {columns.map((h) => {
                const key = `${day}-${h}`;
                const cell = grid.get(key);
                const thin = isThinCell(cell);
                const isSelected = selected === key;
                const base = cn(
                  'flex h-9 items-center justify-center rounded-md text-[11px] font-medium tabular-nums text-fg',
                  !cell && 'border border-line bg-surface-2/40',
                  cell && thin && 'border border-dashed border-line-2 text-muted',
                  isSelected && 'outline-2 outline-offset-2 outline-fg',
                );
                if (!cell) {
                  return <div key={h} role="img" aria-label={describe(day, h)} className={base} />;
                }
                return (
                  <button
                    key={h}
                    type="button"
                    aria-label={describe(day, h, cell)}
                    aria-pressed={isSelected}
                    title={describe(day, h, cell)}
                    onClick={() => setSelected(isSelected ? null : key)}
                    className={cn(base, 'cursor-pointer transition-transform duration-150 hover:scale-[1.06]')}
                    style={thin ? { backgroundColor: 'rgb(125 136 153 / 0.12)' } : paint(cell)}
                  >
                    {cell.count}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <p className="mt-3 min-h-5 text-sm text-fg-2" role="status" aria-live="polite">
        {selectedCell && selected ? (
          <>
            <span className="font-medium text-fg">
              {capFirst(WEEKDAYS[selectedDay])} {selectedHour} h (NY)
            </span>{' '}
            : {selectedCell.count} trade(s), <PnlAmount value={selectedCell.pnl} currency={currency} className="font-semibold" />
            {isThinCell(selectedCell) && <span className="text-muted"> · échantillon insuffisant</span>}
          </>
        ) : (
          <span className="text-muted">Touche une case pour voir son détail.</span>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: `rgb(${gainRgb} / 0.8)` }} aria-hidden />
          Gains
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: `${LOSS_HATCH}, rgb(${lossRgb} / 0.8)` }} aria-hidden />
          Pertes (hachurées)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-dashed border-line-2 bg-surface-2/60" aria-hidden />
          Moins de {MIN_HEAT_SAMPLE} trades (grisé)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-line bg-surface-2" aria-hidden />
          Aucun trade
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">
        Heure d’entrée à New York, quel que soit le fuseau du compte. Le chiffre indique le nombre de trades.
        {thinCount > 0 && ` ${thinCount} case(s) grisée(s) : moins de ${MIN_HEAT_SAMPLE} trades, lecture indicative.`}
      </p>

      <details className="mt-4 overflow-hidden rounded-xl border border-line bg-surface-2/30">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium text-fg-2 transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
          Voir les cases en tableau
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-sm md:min-w-[360px]">
            <caption className="sr-only">Trades par jour et heure d’entrée à New York</caption>
            <thead className="text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Jour et heure (NY)
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Trades
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  P&amp;L net
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((e) => (
                <tr key={e.key} className={cn(isThinCell(e) && 'text-muted')}>
                  <td className="px-4 py-2 text-fg-2">
                    {capFirst(WEEKDAYS[e.day])} {e.hour} h
                    {isThinCell(e) && <span className="ml-2 text-xs text-muted">(échantillon insuffisant)</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{e.count}</td>
                  <td className="px-4 py-2 text-right">
                    <PnlAmount value={e.pnl} currency={currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
