import { useMemo, useState } from 'react';
import { Bar, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useReducedMotion } from 'motion/react';
import { daysInPeriod, mean, PERIODS, type DayBar, type Period } from '../../lib/chartData';
import { formatMoney, formatNumber } from '../../lib/format';
import { usePalette } from '../PaletteContext';
import { Segmented } from '../ui';
import { ChartFrame, ChartTable, EmptyChart, TooltipCard, TooltipRow } from './ChartFrame';
import { axisTick, chartPalette } from './shared';

interface DailyPnlChartProps {
  bars: DayBar[];
  currency: string;
  title?: string;
  description?: string;
}

function DayTooltip({ active, payload, currency }: { active?: boolean; payload?: readonly { payload?: unknown }[]; currency: string }) {
  const bar = payload?.[0]?.payload as DayBar | undefined;
  if (!active || !bar || typeof bar.pnl !== 'number') return null;
  return (
    <TooltipCard title={bar.label}>
      <TooltipRow label="P&L net">{formatMoney(bar.pnl, currency, true)}</TooltipRow>
      <TooltipRow label="Trades">{bar.count}</TooltipRow>
    </TooltipCard>
  );
}

/** P&L net par jour de trading, avec la moyenne journalière en pointillés. */
export function DailyPnlChart({ bars: allBars, currency, title = 'P&L par jour', description = 'Chaque barre est une journée de trading.' }: DailyPnlChartProps) {
  const { gainRgb, lossRgb } = usePalette();
  const reduce = useReducedMotion();
  const [period, setPeriod] = useState<Period>('30j');
  const bars = useMemo(() => daysInPeriod(allBars, period), [allBars, period]);
  const average = useMemo(() => mean(bars.map((b) => b.pnl)), [bars]);

  const periodControl = (
    <Segmented id="daily-period" label="Période du P&L par jour" options={PERIODS} value={period} onChange={setPeriod} />
  );

  if (bars.length === 0) {
    return (
      <ChartFrame title={title} description={description} actions={periodControl}>
        <EmptyChart>Aucune journée de trading sur cette période.</EmptyChart>
      </ChartFrame>
    );
  }

  const winningDays = bars.filter((b) => b.pnl > 0).length;

  return (
    <ChartFrame
      title={title}
      description={`${description} ${winningDays} jour(s) gagnant(s) sur ${bars.length}.`}
      actions={periodControl}
    >
      <div role="img" aria-label={`P&L par jour : ${bars.length} jours, moyenne ${formatMoney(average ?? 0, currency, true)} par jour`} className="h-56 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={bars} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={chartPalette().grid} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="label" tick={axisTick()} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis width={72} tick={axisTick()} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNumber(v, 0)} />
            <ReferenceLine y={0} stroke={chartPalette().cursor} />
            <Tooltip cursor={{ fill: chartPalette().cursorFill }} content={<DayTooltip currency={currency} />} />
            <Bar dataKey="pnl" radius={[3, 3, 3, 3]} isAnimationActive={!reduce} animationDuration={700}>
              {bars.map((b) => (
                <Cell key={b.date} fill={b.pnl >= 0 ? `rgb(${gainRgb} / 0.85)` : `rgb(${lossRgb} / 0.85)`} />
              ))}
            </Bar>
            {average !== null && (
              <ReferenceLine
                y={average}
                stroke={chartPalette().text}
                strokeDasharray="4 4"
                label={{ value: `Moyenne ${formatMoney(average, currency, true)}`, position: 'insideTopRight', fill: chartPalette().text, fontSize: 11, stroke: chartPalette().marker, strokeWidth: 3, paintOrder: 'stroke' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        caption="P&L net par jour de trading"
        head={['Jour', 'P&L net', 'Trades']}
        rows={bars.map((b) => [b.label, formatMoney(b.pnl, currency, true), b.count])}
      />
    </ChartFrame>
  );
}
