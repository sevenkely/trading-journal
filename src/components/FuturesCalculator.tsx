import { useState, type ReactNode } from 'react';
import {
  futuresContract,
  futuresMultiplier,
  futuresPnl,
  futuresPositionSize,
  parseFuturesSymbol,
  type FuturesSize,
} from '../lib/futures';
import { formatMoney, formatNumber, formatPercent } from '../lib/format';
import type { Direction } from '../lib/types';
import { numberOrNull } from '../lib/utils';
import { Badge, Button, Eyebrow, Field, Input, Panel, TickRail, cn } from './ui';

/** Champs du trade que le calculateur peut remplir d'un clic. */
export interface FuturesApplyPatch {
  size?: number;
  riskAmount?: number;
  grossPnl?: number;
}

interface FuturesCalculatorProps {
  instrument: string;
  /** Solde du compte du trade, dans sa devise. */
  balance: number;
  currency: string;
  direction: Direction;
  entry: string;
  stop: string;
  takeProfit?: string;
  /** Prix de sortie et taille : fournis, le P&L brut se calcule depuis le contrat. */
  exit?: string;
  size?: string;
  onApply: (patch: FuturesApplyPatch) => void;
  /** `panel` : carte autonome (formulaire de trade). `compact` : bloc nu (ajout rapide). */
  variant?: 'panel' | 'compact';
  className?: string;
}

/** Ce que le stop coûte, mesuré avec les constantes du contrat. */
function StopRail({ plan }: { plan: FuturesSize }) {
  // L'échelle, ce sont les contrats que le budget peut payer : un cran = un contrat entier.
  const ticks = Math.max(6, Math.min(24, plan.contracts > 0 ? plan.contracts : 6));
  const budgetInContracts = plan.riskPerContract > 0 ? plan.riskAmount / plan.riskPerContract : 0;
  const marker = budgetInContracts > 0 ? Math.min(1, budgetInContracts / ticks) : null;
  return (
    <TickRail
      ratio={plan.contracts / ticks}
      ticks={ticks}
      majorEvery={5}
      tone="accent"
      height="sm"
      marker={marker}
      ariaLabel={`${plan.contracts} contrat(s) sur les ${plan.contracts} que le risque visé finance ; stop à ${formatNumber(plan.stopTicks, 2)} tick(s)`}
      label={
        <>
          <span>stop à {formatNumber(plan.stopTicks, 2)} tick(s)</span>
          <span className="figure text-fg-2">{formatMoney(plan.riskPerContract, 'USD')} / contrat</span>
        </>
      }
    />
  );
}

function ContractBadges({ instrument }: { instrument: string }) {
  const parsed = parseFuturesSymbol(instrument);
  if (!parsed) return null;
  const { contract } = parsed;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="figure text-sm font-semibold text-fg">{parsed.symbol}</span>
      <span className="text-[13px] text-fg-2">
        {contract.name} · {contract.exchange}
      </span>
      {parsed.expiryLabel && <Badge tone="info">échéance {parsed.expiryLabel}</Badge>}
      {parsed.continuous && <Badge tone="neutral">continu</Badge>}
    </div>
  );
}

function SpecLine({ instrument }: { instrument: string }) {
  const contract = parseFuturesSymbol(instrument)?.contract;
  if (!contract) return null;
  const micro = contract.micro ? futuresContract(contract.micro) : null;
  return (
    <p className="text-[11px] leading-relaxed text-muted">
      tick <span className="figure text-fg-2">{formatNumber(contract.tickSize, 6)}</span> pt ={' '}
      <span className="figure text-fg-2">{formatMoney(contract.tickValue, 'USD')}</span> · point{' '}
      <span className="figure text-fg-2">{formatMoney(futuresMultiplier(contract), 'USD')}</span>
      {micro && (
        <>
          {' · micro '}
          <span className="figure text-fg-2">{micro.root}</span>
        </>
      )}
    </p>
  );
}

/**
 * Calcul propre au marché futures : taille en contrats entiers, risque en dollars et P&L
 * déduits des constantes du contrat (tick, valeur du tick, multiplicateur). Ne s'affiche que
 * si l'instrument est un future reconnu.
 */
export default function FuturesCalculator({
  instrument,
  balance,
  currency,
  direction,
  entry,
  stop,
  takeProfit = '',
  exit = '',
  size = '',
  onApply,
  variant = 'panel',
  className,
}: FuturesCalculatorProps) {
  const [riskPct, setRiskPct] = useState('1');
  const parsed = parseFuturesSymbol(instrument);
  if (!parsed) return null;

  const { contract } = parsed;
  const risk = numberOrNull(riskPct);
  const entryValue = numberOrNull(entry);
  const stopValue = numberOrNull(stop);
  const exitValue = numberOrNull(exit);
  const sizeValue = numberOrNull(size);
  const takeProfitValue = numberOrNull(takeProfit);

  const plan =
    entryValue !== null && stopValue !== null && risk !== null
      ? futuresPositionSize({
          contract,
          balance,
          riskPct: risk,
          entry: entryValue,
          stop: stopValue,
          direction,
          takeProfit: takeProfitValue,
        })
      : null;

  const pnl =
    entryValue !== null && exitValue !== null && sizeValue !== null
      ? futuresPnl({ contract, direction, entry: entryValue, exit: exitValue, contracts: sizeValue })
      : null;

  const microPlan = plan?.micro ?? null;
  const sideLabel = direction === 'long' ? 'achat' : 'vente';

  const riskField = (
    <Field
      label="Risque visé"
      hint={
        variant === 'compact'
          ? undefined
          : `Base ${formatMoney(balance, currency)} · ${risk === null ? 'risque à saisir' : `${formatPercent(risk)} visés`}`
      }
    >
      <Input inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} placeholder="1 %" />
    </Field>
  );

  let result: ReactNode;
  if (plan === null) {
    result = (
      <p className="text-[13px] leading-relaxed text-muted">
        Entrée et stop loss, et le nombre de contrats suit — calculé avec les constantes du contrat, pas un lot générique.
      </p>
    );
  } else if (plan.stopOnWrongSide) {
    result = (
      <p className="text-[13px] leading-relaxed text-loss">
        Stop du mauvais côté : un {sideLabel} place son stop {direction === 'long' ? 'sous' : 'au-dessus de'} l’entrée.
      </p>
    );
  } else {
    const compact = variant === 'compact';
    // Un seul bouton d'action : la taille proposée, celle du contrat plein ou du micro.
    const applyButton =
      plan.contracts > 0 ? (
        <Button size="sm" variant="primary" onClick={() => onApply({ size: plan.contracts, riskAmount: plan.actualRisk })}>
          Utiliser : {plan.contracts} {contract.root}
        </Button>
      ) : microPlan ? (
        <Button
          size="sm"
          variant="primary"
          onClick={() => onApply({ size: microPlan.contracts, riskAmount: microPlan.actualRisk })}
        >
          Utiliser : {microPlan.contracts} {microPlan.contract.root}
        </Button>
      ) : null;

    result = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="figure text-2xl font-semibold leading-none text-fg">{plan.contracts}</span>
            <span className="text-[13px] font-medium text-fg-2">
              {' '}
              contrat{plan.contracts > 1 ? 's' : ''} {contract.root}
            </span>
          </div>
          {applyButton}
        </div>

        <StopRail plan={plan} />

        <p className="text-[11px] leading-relaxed text-muted">
          risque réel <span className="figure text-fg-2">{formatMoney(plan.actualRisk, 'USD')}</span> sur{' '}
          <span className="figure text-fg-2">{formatMoney(plan.riskAmount, 'USD')}</span> visés
          {!compact && plan.contracts > 0 && (
            <>
              {' · '}
              <span className="figure text-fg-2">{formatMoney(plan.notional, 'USD')}</span> de notionnel
            </>
          )}
          {plan.rr !== null && plan.contracts > 0 && (
            <>
              {' · objectif '}
              <span className="figure text-fg-2">{formatNumber(plan.rr, 2)} R</span>
              {' pour '}
              <span className="figure text-fg-2">{formatMoney(plan.potential, 'USD')}</span>
            </>
          )}
        </p>

        {plan.contracts === 0 && microPlan && (
          <p className="text-[13px] leading-relaxed text-fg-2">
            Le risque visé ne paie pas un contrat {contract.root} : {microPlan.contracts}{' '}
            <span className="figure">{microPlan.contract.root}</span> tiennent le même stop pour{' '}
            <span className="figure">{formatMoney(microPlan.actualRisk, 'USD')}</span>.
          </p>
        )}

        {plan.contracts === 0 && !microPlan && (
          <p className="text-[13px] leading-relaxed text-fg-2">
            Plus petit qu’un contrat, même en micro : augmente le risque visé ou resserre le stop.
          </p>
        )}
      </div>
    );
  }

  const pnlLine = pnl && (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
      <p className="min-w-0 text-[11px] leading-relaxed text-muted">
        P&amp;L brut sur <span className="figure text-fg-2">{formatNumber(sizeValue, 2)}</span> contrat(s){' '}
        {contract.root} ({sideLabel})
        <br />
        <span className="figure text-sm font-semibold text-fg">{formatMoney(pnl.grossPnl, 'USD', true)}</span>
        <span className="ml-2">
          <span className="figure text-fg-2">{formatNumber(pnl.points, 2)}</span> pt ·{' '}
          <span className="figure text-fg-2">{formatNumber(pnl.ticks, 2)}</span> tick(s)
        </span>
      </p>
      <Button size="sm" onClick={() => onApply({ grossPnl: pnl.grossPnl })}>
        Utiliser ce P&amp;L
      </Button>
    </div>
  );

  const currencyNote = currency !== 'USD' && (
    <p className="text-[11px] leading-relaxed text-muted">
      Contrats américains libellés en dollars : ce compte est en {currency}, convertis avant de comparer.
    </p>
  );

  if (variant === 'compact') {
    return (
      <div className={cn('space-y-3.5 rounded-xl border border-line-2 bg-surface-2/50 p-4', className)}>
        <div className="space-y-1.5">
          <Eyebrow>Calcul futures</Eyebrow>
          <ContractBadges instrument={instrument} />
          <SpecLine instrument={instrument} />
        </div>
        {/* Le risque et le résultat sur une ligne : ce bloc vit dans une feuille étroite. */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="w-24">{riskField}</div>
          <div className="min-w-0 flex-1 basis-52">{result}</div>
        </div>
        {pnlLine}
        {currencyNote}
      </div>
    );
  }

  return (
    <Panel
      eyebrow="Calcul futures"
      title="Position en contrats"
      description={`Constantes du contrat ${contract.root} (${contract.name}, ${contract.exchange}) : la taille se calcule en contrats entiers.`}
      action={<ContractBadges instrument={instrument} />}
      className={className}
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        <div className="space-y-3">{riskField}</div>
        <div className="rounded-xl border border-line-2 bg-surface-2/50 p-4">{result}</div>
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <SpecLine instrument={instrument} />
      </div>
      {pnlLine && <div className="mt-4">{pnlLine}</div>}
      {currencyNote && <div className="mt-3">{currencyNote}</div>}
    </Panel>
  );
}
