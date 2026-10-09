import { usePalette } from '../PaletteContext';
import { ChartFrame, EmptyChart } from './ChartFrame';
import { LOSS_HATCH, chartPalette } from './shared';
import type { OutcomeSplit } from '../../lib/chartData';

/** Répartition gagnants / perdants / break-even en barre empilée, avec effectifs et parts. */
export function OutcomeBar({ split }: { split: OutcomeSplit }) {
  const { gainRgb, lossRgb } = usePalette();

  if (split.total === 0) {
    return (
      <ChartFrame title="Gagnants et perdants" description="Selon le signe du P&L net.">
        <EmptyChart>Aucun trade sur cette période.</EmptyChart>
      </ChartFrame>
    );
  }

  const segments = [
    { key: 'win', label: 'Gagnants', count: split.wins, color: `rgb(${gainRgb} / 0.85)`, hatch: false },
    { key: 'loss', label: 'Perdants', count: split.losses, color: `rgb(${lossRgb} / 0.85)`, hatch: true },
    { key: 'be', label: 'Break-even', count: split.breakeven, color: `${chartPalette().neutral}cc`, hatch: false },
  ];
  const share = (n: number) => (n / split.total) * 100;
  const summary = segments.map((s) => `${s.label} ${s.count} (${Math.round(share(s.count))} %)`).join(', ');

  return (
    <ChartFrame title="Gagnants et perdants" description="Selon le signe du P&L net. Les pertes sont hachurées.">
      <div role="img" aria-label={`Répartition de ${split.total} trades : ${summary}`} className="flex h-5 overflow-hidden rounded-full bg-surface-3">
        {segments.map((s) =>
          s.count > 0 ? (
            <div
              key={s.key}
              style={{ width: `${share(s.count)}%`, backgroundColor: s.color, backgroundImage: s.hatch ? LOSS_HATCH : undefined }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.key} className="rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
              {s.label}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums text-fg">{s.count}</span>
              <span className="text-xs tabular-nums text-muted">{Math.round(share(s.count))} %</span>
            </div>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
