import { useId, useMemo, useState } from 'react';
import { Area, AreaChart, Brush, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReducedMotion } from 'motion/react';
import { buildCurve, equityExtremes, PERIODS, sliceCurve, targetLevel, worstDrawdownPct, type CurvePoint, type DrawdownRule, type Period } from '../../lib/chartData';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent } from '../../lib/format';
import type { Trade } from '../../lib/types';
import { PnlAmount, Segmented, cn } from '../ui';
import { ChartFrame, ChartTable, EmptyChart, TooltipCard, TooltipRow } from './ChartFrame';
import { axisTick, chartPalette } from './shared';

export interface EquityPanelProps {
  trades: Trade[];
  startingBalance: number;
  currency: string;
  rule?: DrawdownRule;
}

function isCurvePoint(value: unknown): value is CurvePoint {
  return typeof value === 'object' && value !== null && 'equity' in value && 'n' in value && 'drawdownPct' in value;
}

function EquityTooltip({ active, payload, currency }: { active?: boolean; payload?: readonly { payload?: unknown }[]; currency: string }) {
  const point = payload?.[0]?.payload;
  if (!active || !isCurvePoint(point)) return null;
  return (
    <TooltipCard title={point.n === 0 ? 'Solde initial' : `Trade n°${point.n} · ${formatDateTime(point.time)}`}>
      {point.n > 0 && (
        <TooltipRow label="P&L net">
          <PnlAmount value={point.pnl} currency={currency} />
        </TooltipRow>
      )}
      <TooltipRow label="Équité">{formatMoney(point.equity, currency)}</TooltipRow>
      <TooltipRow label="Drawdown">
        {formatMoney(point.drawdown, currency)} · {formatPercent(point.drawdownPct, 2)}
      </TooltipRow>
      {point.limit !== null && <TooltipRow label="Marge avant limite">{formatMoney(point.equity - point.limit, currency)}</TooltipRow>}
    </TooltipCard>
  );
}

/**
 * Courbe d’équité (dégradé, solde initial, seuil de drawdown et objectif), barre de zoom (brush),
 * périodes et drawdown réalisé. Le drawdown suit le même zoom que la courbe.
 */
/** Libellé d’un extrême : à gauche du point quand il est près du bord droit, pour ne pas être coupé. */
function markerPosition(index: number, length: number, vertical: 'top' | 'bottom'): 'left' | 'top' | 'bottom' {
  return length > 1 && index / (length - 1) > 0.7 ? 'left' : vertical;
}

export function EquityPanel({ trades, startingBalance, currency, rule }: EquityPanelProps) {
  const reduce = useReducedMotion();
  const gradientId = `equity-fill-${useId().replace(/:/g, '')}`;
  const [period, setPeriod] = useState<Period>('all');
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null);

  const curve = useMemo(() => buildCurve(trades, startingBalance, rule), [trades, startingBalance, rule]);
  const visible = useMemo(() => sliceCurve(curve, period), [curve, period]);

  const last = Math.max(0, visible.length - 1);
  const start = Math.min(Math.max(0, zoom?.start ?? 0), last);
  const end = Math.min(Math.max(start, zoom?.end ?? last), last);
  const focus = visible.slice(start, end + 1);

  const extremes = equityExtremes(focus);
  const target = targetLevel(startingBalance, rule);
  const hasLimit = visible.some((p) => p.limit !== null);
  const limitNow = focus.at(-1)?.limit ?? null;
  const labelOf = useMemo(() => new Map(visible.map((p) => [p.n, p.time ? formatDate(p.time, { day: '2-digit', month: '2-digit' }) : 'Départ'])), [visible]);
  const tickLabel = (value: number) => labelOf.get(value) ?? '';

  const changePeriod = (next: Period) => {
    setPeriod(next);
    setZoom(null);
  };

  const periodControl = (
    <>
      <Segmented id="equity-period" label="Période de la courbe" options={PERIODS} value={period} onChange={changePeriod} />
      {zoom && (
        <button
          type="button"
          onClick={() => setZoom(null)}
          className="h-8 rounded-lg px-3 text-xs font-medium text-accent-hi transition-colors hover:bg-surface-3"
        >
          Tout voir
        </button>
      )}
    </>
  );

  if (visible.length < 2) {
    return (
      <ChartFrame title="Courbe d’équité" description="Depuis le départ du compte." actions={periodControl}>
        <EmptyChart>Aucun trade sur cette période : la courbe apparaîtra après le premier trade.</EmptyChart>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title="Courbe d’équité"
      description="Depuis le départ du compte. Déplace les poignées de la barre du bas pour zoomer ; le drawdown suit."
      actions={periodControl}
    >
      <div role="img" aria-label={`Courbe d’équité : ${formatMoney(focus[0].equity, currency)} au début, ${formatMoney(focus.at(-1)?.equity ?? 0, currency)} à la fin de la sélection`} className="h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visible} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartPalette().equity} stopOpacity={0.28} />
                <stop offset="100%" stopColor={chartPalette().equity} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chartPalette().grid} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="n" tick={axisTick()} tickLine={false} axisLine={false} minTickGap={32} tickFormatter={tickLabel} />
            <YAxis width={72} tick={axisTick()} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(v: number) => formatNumber(v, 0)} />
            <Tooltip cursor={{ stroke: chartPalette().cursor, strokeDasharray: '3 3' }} content={<EquityTooltip currency={currency} />} />
            <ReferenceLine y={startingBalance} stroke={chartPalette().neutral} strokeDasharray="1 4" />
            {target !== null && (
              <ReferenceLine
                y={target}
                stroke={chartPalette().target}
                strokeDasharray="6 4"
                label={{ value: `Objectif ${formatNumber(target, 0)}`, position: 'insideTopLeft', fill: chartPalette().target, fontSize: 11 }}
              />
            )}
            <Area
              type="monotone"
              dataKey="equity"
              stroke={chartPalette().equity}
              strokeWidth={2.25}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 5, fill: chartPalette().equity, stroke: chartPalette().marker, strokeWidth: 3 }}
              isAnimationActive={!reduce}
              animationDuration={900}
            />
            {hasLimit && (
              <Line type="monotone" dataKey="limit" stroke={chartPalette().limit} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
            )}
            {extremes && (
              <>
                <ReferenceDot
                  x={focus[extremes.high.index].n}
                  y={extremes.high.equity}
                  r={4}
                  fill={chartPalette().equity}
                  stroke={chartPalette().marker}
                  strokeWidth={2}
                  label={{ value: `Max ${formatNumber(extremes.high.equity, 0)}`, position: markerPosition(extremes.high.index, focus.length, 'top'), fill: chartPalette().text, fontSize: 11 }}
                />
                <ReferenceDot
                  x={focus[extremes.low.index].n}
                  y={extremes.low.equity}
                  r={4}
                  fill={chartPalette().limit}
                  stroke={chartPalette().marker}
                  strokeWidth={2}
                  label={{ value: `Min ${formatNumber(extremes.low.equity, 0)}`, position: markerPosition(extremes.low.index, focus.length, 'bottom'), fill: chartPalette().text, fontSize: 11 }}
                />
              </>
            )}
            <Brush
              dataKey="n"
              height={26}
              stroke={chartPalette().cursor}
              fill={chartPalette().surface}
              travellerWidth={8}
              startIndex={start}
              endIndex={end}
              tickFormatter={tickLabel}
              onChange={({ startIndex, endIndex }) => setZoom({ start: startIndex ?? 0, end: endIndex ?? last })}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 h-28" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={focus} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={chartPalette().grid} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="n" hide />
            <YAxis width={72} tick={axisTick()} tickLine={false} axisLine={false} domain={['dataMin', 0]} tickFormatter={(v: number) => `${formatNumber(v, 1)} %`} />
            <Area
              type="monotone"
              dataKey="drawdownPct"
              stroke={chartPalette().limit}
              strokeWidth={1.5}
              fill={chartPalette().limitFill}
              isAnimationActive={!reduce}
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-muted">Drawdown réalisé, en % du pic (historique depuis le départ).</p>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        {target !== null && (
          <li className="flex items-center gap-2">
            <span className="w-5 border-t-2 border-dashed" style={{ borderColor: chartPalette().target }} aria-hidden />
            Objectif {formatMoney(target, currency)}
          </li>
        )}
        {hasLimit && (
          <li className="flex items-center gap-2">
            <span className="w-5 border-t-2 border-dashed" style={{ borderColor: chartPalette().limit }} aria-hidden />
            Seuil de drawdown {limitNow !== null ? formatMoney(limitNow, currency) : ''}
          </li>
        )}
        {extremes && (
          <li>
            Plus haut <span className="text-fg-2">{formatMoney(extremes.high.equity, currency)}</span> · plus bas{' '}
            <span className="text-fg-2">{formatMoney(extremes.low.equity, currency)}</span>
          </li>
        )}
        <li className={cn(worstDrawdownPct(focus) < 0 && 'text-fg-2')}>Pire drawdown {formatPercent(worstDrawdownPct(focus), 2)}</li>
      </ul>

      <ChartTable
        caption="Courbe d’équité : valeurs par trade"
        head={['Point', 'Date', 'P&L net', 'Équité', 'Drawdown']}
        rows={focus.map((p) => [
          p.n === 0 ? 'Départ' : `n°${p.n}`,
          p.time ? formatDateTime(p.time) : '—',
          p.n === 0 ? '—' : formatMoney(p.pnl, currency, true),
          formatMoney(p.equity, currency),
          `${formatMoney(p.drawdown, currency)} (${formatPercent(p.drawdownPct, 2)})`,
        ])}
      />
    </ChartFrame>
  );
}
