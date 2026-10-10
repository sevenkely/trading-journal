import { useMemo } from 'react';
import { Bar, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useReducedMotion } from 'motion/react';
import type { BreakdownRow } from '../../lib/metrics';
import { mean } from '../../lib/chartData';
import { formatMoney, formatNumber, formatPercent } from '../../lib/format';
import { usePalette } from '../PaletteContext';
import { ChartFrame, ChartTable, EmptyChart, TooltipCard, TooltipRow } from './ChartFrame';
import { axisTick, chartPalette } from './shared';

interface Row extends BreakdownRow {
  /** Libellé court du jour, encadré sur trois lettres */
  short: string;
}

function WeekdayTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  currency: string;
}) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  return (
    <TooltipCard title={row.key}>
      <TooltipRow label="P&L net">{formatMoney(row.netPnl, currency, true)}</TooltipRow>
      <TooltipRow label="Trades">{row.count}</TooltipRow>
      <TooltipRow label="Moyenne">{formatMoney(row.avgPnl, currency, true)}</TooltipRow>
      <TooltipRow label="Réussite">{formatPercent(row.winRate)}</TooltipRow>
    </TooltipCard>
  );
}

/**
 * P&L net par jour de la semaine, dans l'ordre du calendrier (lundi à dimanche).
 * Les jours sans trade restent visibles à zéro : l'absence de trades est une information.
 */
export function WeekdayPnlChart({
  rows,
  currency,
  order = 7,
}: {
  /** Une ligne par jour de la semaine, déjà ordonnée */
  rows: BreakdownRow[];
  currency: string;
  /** Jours à afficher (5 pour les jours ouvrés, 7 sinon) */
  order?: number;
}) {
  const { gainRgb, lossRgb } = usePalette();
  const reduce = useReducedMotion();

  const data = useMemo<Row[]>(
    () =>
      rows.slice(0, order).map((row) => ({ ...row, short: row.key.slice(0, 3) })),
    [rows, order],
  );
  const average = useMemo(() => mean(data.filter((d) => d.count > 0).map((d) => d.netPnl)), [data]);

  if (data.every((row) => row.count === 0)) {
    return (
      <ChartFrame title="P&L par jour de la semaine" description="Où se gagne et se perd la semaine.">
        <EmptyChart>Aucun trade sur cette période.</EmptyChart>
      </ChartFrame>
    );
  }

  const best = data.reduce((top, row) => (row.netPnl > top.netPnl ? row : top), data[0]);
  const worst = data.reduce((low, row) => (row.netPnl < low.netPnl ? row : low), data[0]);
  const traded = data.filter((row) => row.count > 0).length;

  return (
    <ChartFrame
      title="P&L par jour de la semaine"
      description={`${traded} jour(s) avec des trades. Meilleur : ${best.key} (${formatMoney(best.netPnl, currency, true)}), pire : ${worst.key} (${formatMoney(worst.netPnl, currency, true)}).`}
    >
      <div
        role="img"
        aria-label={data.map((row) => `${row.key} ${formatMoney(row.netPnl, currency, true)}`).join(', ')}
        className="h-56 md:h-64"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={chartPalette().grid} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="short" tick={axisTick()} tickLine={false} axisLine={false} />
            <YAxis
              width={72}
              tick={axisTick()}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatNumber(v, 0)}
            />
            <ReferenceLine y={0} stroke={chartPalette().cursor} />
            <Tooltip cursor={{ fill: chartPalette().cursorFill }} content={<WeekdayTooltip currency={currency} />} />
            <Bar dataKey="netPnl" radius={[3, 3, 3, 3]} isAnimationActive={!reduce} animationDuration={700}>
              {data.map((row) => (
                <Cell
                  key={row.key}
                  fill={row.count === 0 ? `${chartPalette().neutral}44` : row.netPnl >= 0 ? `rgb(${gainRgb} / 0.85)` : `rgb(${lossRgb} / 0.85)`}
                />
              ))}
            </Bar>
            {average !== null && (
              <ReferenceLine
                y={average}
                stroke={chartPalette().text}
                strokeDasharray="4 4"
                label={{
                  value: `Moyenne ${formatMoney(average, currency, true)}`,
                  position: 'insideTopRight',
                  fill: chartPalette().text,
                  fontSize: 11,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartTable
        caption="Résultats par jour de la semaine"
        head={['Jour', 'Trades', 'P&L net', 'Moyenne', 'Réussite']}
        rows={data.map((row) => [
          row.key,
          row.count,
          formatMoney(row.netPnl, currency, true),
          formatMoney(row.avgPnl, currency, true),
          row.count === 0 ? '—' : formatPercent(row.winRate),
        ])}
      />
    </ChartFrame>
  );
}
