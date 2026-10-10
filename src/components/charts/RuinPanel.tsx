import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReducedMotion } from 'motion/react';
import type { Account, Trade } from '../../lib/types';
import { monteCarloRuin } from '../../lib/ruin';
import { rMultiples } from '../../lib/chartData';
import { resolveAmount } from '../../lib/rules';
import { formatMoney, formatNumber, formatPercent } from '../../lib/format';
import { Input, PnlAmount, Segmented, cn } from '../ui';
import { ChartFrame, ChartTable, EmptyChart, TooltipCard, TooltipRow } from './ChartFrame';
import { axisTick, chartPalette } from './shared';

/** Séquences simulées : assez pour stabiliser les probabilités, assez peu pour rester instantané. */
export const SIMULATIONS = 2000;

const HORIZONS = [
  { value: 50, label: '50 trades' },
  { value: 100, label: '100 trades' },
  { value: 200, label: '200 trades' },
];

/** Risque par trade proposé : le plus fréquent sur le compte, sinon 0,5 % du solde initial. */
export function suggestedRisk(trades: Trade[], initialBalance: number): number {
  const risks = trades
    .filter((t) => t.risk_amount !== null && t.risk_amount > 0)
    .map((t) => t.risk_amount as number)
    .sort((a, b) => a - b);
  if (risks.length > 0) return Math.max(1, Math.round(risks[Math.floor(risks.length / 2)]));
  return Math.max(1, Math.round(initialBalance * 0.005));
}

function BandTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  currency: string;
}) {
  const point = payload?.[0]?.payload as { step?: number; p5?: number; p50?: number; p95?: number } | undefined;
  if (!active || !point || point.step === undefined) return null;
  return (
    <TooltipCard title={`Après ${point.step} trade${point.step > 1 ? 's' : ''}`}>
      <TooltipRow label="Médiane">{formatMoney(point.p50 ?? 0, currency, true)}</TooltipRow>
      <TooltipRow label="Favorable (p95)">{formatMoney(point.p95 ?? 0, currency, true)}</TooltipRow>
      <TooltipRow label="Défavorable (p5)">{formatMoney(point.p5 ?? 0, currency, true)}</TooltipRow>
    </TooltipCard>
  );
}

/**
 * Risque de ruine : rejoue la distribution de R du compte sur des milliers de séquences
 * et compare le seuil de perte maximale à l'objectif de profit.
 */
export function RuinPanel({ account, trades, currency }: { account: Account; trades: Trade[]; currency: string }) {
  const reduce = useReducedMotion();
  const [risk, setRisk] = useState(() => suggestedRisk(trades, account.initial_balance));
  const [horizon, setHorizon] = useState(100);

  const samples = useMemo(() => rMultiples(trades), [trades]);
  const maxLoss = resolveAmount(account.max_loss_amount, account.max_loss_pct, account.initial_balance);
  const target = resolveAmount(account.profit_target_amount, account.profit_target_pct, account.initial_balance);

  const result = useMemo(
    () =>
      monteCarloRuin({
        samples,
        riskPerTrade: risk,
        maxLoss,
        target,
        horizon,
        simulations: SIMULATIONS,
        trailing: account.drawdown_type === 'trailing',
      }),
    [samples, risk, maxLoss, target, horizon, account.drawdown_type],
  );

  const riskControl = (
    <div className="flex items-end gap-3">
      <label className="flex items-end gap-2 text-xs text-muted">
        <span className="pb-2.5">Risque / trade</span>
        <Input
          type="number"
          min={1}
          step={10}
          value={risk}
          onChange={(e) => setRisk(Math.max(1, Number(e.target.value) || 0))}
          className="h-9 w-28 tabular-nums"
          aria-label="Montant risqué par trade"
        />
      </label>
      <Segmented id="ruin-horizon" label="Horizon simulé" options={HORIZONS} value={horizon} onChange={setHorizon} />
    </div>
  );

  if (samples.length === 0) {
    return (
      <ChartFrame title="Risque de ruine" description="Simulation de Monte-Carlo sur ta distribution de R.">
        <EmptyChart>
          Renseigne le risque par trade sur tes trades : sans distribution de R, la simulation n’a rien à rejouer.
        </EmptyChart>
      </ChartFrame>
    );
  }

  if (maxLoss === null && target === null) {
    return (
      <ChartFrame title="Risque de ruine" description="Simulation de Monte-Carlo sur ta distribution de R.">
        <EmptyChart>Ajoute une limite de perte ou un objectif de profit au compte pour comparer les deux issues.</EmptyChart>
      </ChartFrame>
    );
  }

  if (!result) return null;

  const floor = maxLoss === null ? null : -maxLoss;
  const chartData = result.bands.map((b) => ({
    step: b.step,
    p5: b.p5,
    outer: Math.max(0, b.p95 - b.p5),
    innerBase: Math.max(0, b.p25 - b.p5),
    inner: Math.max(0, b.p75 - b.p25),
    p50: b.p50,
  }));
  const palette = chartPalette();
  const ruinPct = result.ruinProbability * 100;

  return (
    <ChartFrame
      title="Risque de ruine"
      description={`${formatNumber(SIMULATIONS, 0)} séquences de ${horizon} trades tirées dans tes ${samples.length} R observés, avec ${formatMoney(risk, currency)} risqués par trade.`}
      actions={riskControl}
    >
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
        <div className="bg-surface-2/60 p-3.5">
          <div className="text-xs text-muted">Probabilité de ruine</div>
          <div
            className={cn(
              'mt-1 text-lg font-semibold tabular-nums',
              ruinPct >= 20 ? 'text-loss' : ruinPct >= 5 ? 'text-danger' : 'text-gain',
            )}
          >
            {formatPercent(ruinPct)}
          </div>
        </div>
        <div className="bg-surface-2/60 p-3.5">
          <div className="text-xs text-muted">Probabilité d’objectif</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gain">{formatPercent(result.targetProbability * 100)}</div>
        </div>
        <div className="bg-surface-2/60 p-3.5">
          <div className="text-xs text-muted">Trades avant l’objectif</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fg">
            {result.medianTradesToTarget === null ? '—' : formatNumber(result.medianTradesToTarget, 0)}
          </div>
        </div>
        <div className="bg-surface-2/60 p-3.5">
          <div className="text-xs text-muted">Pire baisse médiane</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fg">
            <PnlAmount value={-result.medianWorstDrawdown} currency={currency} />
          </div>
        </div>
      </div>

      <div
        className="h-64 md:h-72"
        role="img"
        aria-label={`Éventail d'équité simulé : médiane ${formatMoney(result.bands.at(-1)?.p50 ?? 0, currency)} après ${horizon} trades, avec ${formatPercent(ruinPct)} de risque de ruine.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={palette.grid} strokeDasharray="2 6" vertical={false} />
            <XAxis
              dataKey="step"
              tick={axisTick()}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tickFormatter={(v: number) => `${v}`}
            />
            <YAxis
              width={72}
              tick={axisTick()}
              tickLine={false}
              axisLine={false}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => formatNumber(v, 0)}
            />
            <Tooltip cursor={{ stroke: palette.cursor, strokeDasharray: '3 3' }} content={<BandTooltip currency={currency} />} />
            {target !== null && (
              <ReferenceLine
                y={target}
                stroke={palette.target}
                strokeDasharray="6 4"
                label={{ value: `Objectif ${formatNumber(target, 0)}`, position: 'insideTopLeft', fill: palette.target, fontSize: 11 }}
              />
            )}
            {floor !== null && (
              <ReferenceLine
                y={floor}
                stroke={palette.limit}
                strokeDasharray="6 4"
                label={{
                  value: `${account.drawdown_type === 'trailing' ? 'Seuil (trailing)' : 'Seuil'} ${formatNumber(floor, 0)}`,
                  position: 'insideBottomLeft',
                  fill: palette.limit,
                  fontSize: 11,
                }}
              />
            )}
            <Area dataKey="p5" stackId="outer" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area
              dataKey="outer"
              stackId="outer"
              stroke="none"
              fill={palette.equity}
              fillOpacity={0.08}
              isAnimationActive={!reduce}
              animationDuration={700}
            />
            <Area dataKey="innerBase" stackId="inner" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area
              dataKey="inner"
              stackId="inner"
              stroke="none"
              fill={palette.equity}
              fillOpacity={0.16}
              isAnimationActive={!reduce}
              animationDuration={700}
            />
            <Line
              dataKey="p50"
              stroke={palette.equity}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 4, fill: palette.equity, stroke: palette.marker, strokeWidth: 3 }}
              isAnimationActive={!reduce}
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-5 rounded-sm" style={{ background: palette.equity, opacity: 0.5 }} aria-hidden />
          Médiane et couloirs 50 % / 90 % des séquences
        </li>
        <li>
          Issues : {formatPercent(result.targetProbability * 100)} objectif · {formatPercent(ruinPct)} ruine ·{' '}
          {formatPercent(result.unfinishedProbability * 100)} en cours
        </li>
      </ul>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        Estimation, pas prédiction : elle suppose que les R passés représentent les R futurs, un risque fixe par trade
        et des trades indépendants.
      </p>

      <ChartTable
        caption="Éventail d’équité simulé, par nombre de trades"
        head={['Trades', 'Défavorable (p5)', 'Médiane', 'Favorable (p95)']}
        rows={result.bands
          .filter((b) => b.step % Math.max(1, Math.round(horizon / 10)) === 0)
          .map((b) => [
            `${b.step}`,
            formatMoney(b.p5, currency, true),
            formatMoney(b.p50, currency, true),
            formatMoney(b.p95, currency, true),
          ])}
      />
    </ChartFrame>
  );
}
