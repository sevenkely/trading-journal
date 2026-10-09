import { useMemo } from 'react';
import { rDistribution } from '../../lib/chartData';
import { formatR } from '../../lib/format';
import { usePalette } from '../PaletteContext';
import { ChartFrame, ChartTable, EmptyChart } from './ChartFrame';
import { LOSS_HATCH, NEUTRAL_COLOR } from './shared';

/** Histogramme des R réalisés par intervalles de 0,5 R, avec moyenne et médiane. */
export function RHistogram({ values }: { values: number[] }) {
  const { gainRgb, lossRgb } = usePalette();
  const dist = useMemo(() => rDistribution(values), [values]);

  if (!dist) {
    return (
      <ChartFrame title="Distribution des R" description="R = résultat net ÷ risque saisi sur le trade.">
        <EmptyChart>Aucun trade avec un risque renseigné : le R n’est pas calculable.</EmptyChart>
      </ChartFrame>
    );
  }

  const span = dist.end - dist.start;
  const peak = Math.max(1, ...dist.bins.map((b) => b.count));
  const at = (value: number) => `${((value - dist.start) / span) * 100}%`;
  const summary = `Distribution des R : ${dist.count} trades, moyenne ${formatR(dist.mean)}, médiane ${formatR(dist.median)}`;

  return (
    <ChartFrame title="Distribution des R" description="R = résultat net ÷ risque saisi. Pertes hachurées.">
      <div role="img" aria-label={summary} className="relative h-48 pt-2">
        <div className="absolute inset-x-0 bottom-0 top-2 flex items-end border-b border-line-2">
          {dist.bins.map((bin) => {
            const isLoss = bin.to <= 0;
            const isGain = bin.from >= 0;
            const color = isLoss ? lossRgb : isGain ? gainRgb : null;
            return (
              <div key={bin.from} className="flex h-full flex-1 items-end px-px">
                {bin.count > 0 && (
                  <div
                    className="w-full rounded-t-sm"
                    style={{
                      height: `${(bin.count / peak) * 100}%`,
                      backgroundColor: color ? `rgb(${color} / 0.8)` : `${NEUTRAL_COLOR}99`,
                      backgroundImage: isLoss ? LOSS_HATCH : undefined,
                    }}
                    title={`${formatR(bin.from)} à ${formatR(bin.to)} : ${bin.count} trade(s)`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <span
          className="pointer-events-none absolute bottom-0 top-2 border-l-2 border-fg"
          style={{ left: at(dist.mean) }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute bottom-0 top-2 border-l-2 border-dashed border-accent-hi"
          style={{ left: at(dist.median) }}
          aria-hidden
        />
        {dist.start < 0 && dist.end > 0 && (
          <span className="pointer-events-none absolute bottom-0 top-2 border-l border-muted" style={{ left: at(0) }} aria-hidden />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted">
        <span>{formatR(dist.start)}</span>
        <span>{formatR(dist.end)}</span>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-2">
          <span className="h-3 border-l-2 border-fg" aria-hidden />
          Moyenne <span className="tabular-nums text-fg-2">{formatR(dist.mean)}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 border-l-2 border-dashed border-accent-hi" aria-hidden />
          Médiane <span className="tabular-nums text-fg-2">{formatR(dist.median)}</span>
        </li>
        <li>{dist.count} trade(s) avec un risque renseigné</li>
      </ul>
      <ChartTable
        caption="Distribution des R par intervalle"
        head={['Intervalle', 'Trades']}
        rows={dist.bins.map((b) => [`${formatR(b.from)} à ${formatR(b.to)}`, b.count])}
      />
    </ChartFrame>
  );
}
