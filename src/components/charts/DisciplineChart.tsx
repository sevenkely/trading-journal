import { Bar, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useReducedMotion } from 'motion/react';
import { formatMoney, formatNumber } from '../../lib/format';
import { usePalette } from '../PaletteContext';
import { ChartFrame, ChartTable, EmptyChart, TooltipCard, TooltipRow } from './ChartFrame';
import { axisTick, chartPalette } from './shared';

export interface DisciplineGroup {
  /** Libellé court affiché sous la barre */
  label: string;
  /** Libellé complet, pour l'infobulle et le tableau */
  full: string;
  /** P&L net moyen par trade, ou null si le groupe est vide */
  value: number | null;
  count: number;
}

function DisciplineTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  currency: string;
}) {
  const group = payload?.[0]?.payload as DisciplineGroup | undefined;
  if (!active || !group) return null;
  return (
    <TooltipCard title={group.full}>
      <TooltipRow label="Trades">{group.count}</TooltipRow>
      <TooltipRow label="Moyenne / trade">
        {group.value === null ? '—' : formatMoney(group.value, currency, true)}
      </TooltipRow>
    </TooltipCard>
  );
}

/**
 * Comparaison des moyennes par trade selon la discipline : plan suivi ou non, erreurs ou non.
 * L'écart entre les barres est le coût visible de l'indiscipline, en devise.
 */
export function DisciplineChart({ groups, currency }: { groups: DisciplineGroup[]; currency: string }) {
  const { gainRgb, lossRgb } = usePalette();
  const reduce = useReducedMotion();
  const shown = groups.filter((group) => group.count > 0);

  if (shown.length === 0) {
    return (
      <ChartFrame title="Coût de la discipline" description="P&L moyen par trade selon le respect du plan.">
        <EmptyChart>Aucun trade renseigné sur le plan ou les erreurs sur cette période.</EmptyChart>
      </ChartFrame>
    );
  }

  const best = shown.reduce((top, group) => ((group.value ?? 0) > (top.value ?? 0) ? group : top), shown[0]);
  const worst = shown.reduce((low, group) => ((group.value ?? 0) < (low.value ?? 0) ? group : low), shown[0]);
  const gap = (best.value ?? 0) - (worst.value ?? 0);

  return (
    <ChartFrame
      title="Coût de la discipline"
      description={`P&L net moyen par trade. Écart entre « ${best.full} » et « ${worst.full} » : ${formatMoney(gap, currency, true)} par trade.`}
    >
      <div
        role="img"
        aria-label={shown.map((group) => `${group.full} : ${formatMoney(group.value ?? 0, currency, true)} par trade sur ${group.count} trades`).join(', ')}
        className="h-52"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={shown} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={chartPalette().grid} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="label" tick={axisTick()} tickLine={false} axisLine={false} />
            <YAxis
              width={72}
              tick={axisTick()}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatNumber(v, 0)}
            />
            <ReferenceLine y={0} stroke={chartPalette().cursor} />
            <Tooltip cursor={{ fill: chartPalette().cursorFill }} content={<DisciplineTooltip currency={currency} />} />
            <Bar dataKey="value" radius={[3, 3, 3, 3]} isAnimationActive={!reduce} animationDuration={700}>
              {shown.map((group) => (
                <Cell
                  key={group.label}
                  fill={(group.value ?? 0) >= 0 ? `rgb(${gainRgb} / 0.85)` : `rgb(${lossRgb} / 0.85)`}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartTable
        caption="P&L net moyen par trade selon la discipline"
        head={['Groupe', 'Trades', 'Moyenne / trade']}
        rows={shown.map((group) => [
          group.full,
          group.count,
          group.value === null ? '—' : formatMoney(group.value, currency, true),
        ])}
      />
    </ChartFrame>
  );
}
