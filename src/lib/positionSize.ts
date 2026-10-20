import { findFuturesContract } from './futures';
import type { Direction } from './types';

/** Pas de taille usuel : 0,01 lot (micro-lot) sur forex, 1 contrat sur les indices. */
export const DEFAULT_LOT_STEP = 0.01;

/** Unités de base d’un lot standard forex (100 000 unités). */
export const DEFAULT_CONTRACT_SIZE = 100_000;

export interface PositionSizeInput {
  /** Solde de référence du compte, dans sa devise. */
  balance: number;
  /** Part du solde risquée sur ce trade, en pourcentage (1 = 1 %). */
  riskPct: number;
  /** Prix d’entrée. */
  entry: number;
  /** Prix du stop loss. */
  stop: number;
  direction: Direction;
  /** Unités de base par lot (100 000 pour le forex standard). */
  contractSize?: number;
  /** Taille minimale, en lots (0,01 = micro-lot). */
  lotStep?: number;
  /** Take profit éventuel, pour le ratio rendement / risque. */
  takeProfit?: number | null;
}

export interface PositionSize {
  /** Montant risqué visé, dans la devise du compte. */
  riskAmount: number;
  /** Distance entrée → stop, en prix (non arrondie : 0,002 reste 0,002). */
  stopDistance: number;
  /** Distance en pips si la taille du pip est connue pour l’instrument. */
  stopPips: number | null;
  /** Taille en unités de base, arrondie au pas de lot (jamais au-dessus du risque visé). */
  units: number;
  /** Taille en lots / contrats. 0 = le pas minimal est trop grand pour ce risque. */
  lots: number;
  /** Risque réel une fois la taille arrondie. */
  actualRisk: number;
  /** Rendement / risque si un take profit est fourni, sinon null. */
  rr: number | null;
  /** Gain potentiel dans la devise du compte si un take profit est fourni, sinon null. */
  potential: number | null;
  /** Le stop est côté inverse du sens (long avec stop au-dessus de l’entrée, ou l’inverse). */
  stopOnWrongSide: boolean;
}

/** Arrondi vers le bas au pas donné, avec une tolérance flottante (0,5 / 0,01 ne doit pas devenir 0,49). */
function floorStep(value: number, step: number): number {
  const floored = Math.floor(value / step + 1e-9) * step;
  // Re-simplifie le flottant (0.30000000000000004 → 0.3)
  return Number(floored.toFixed(6));
}

/**
 * Taille de position cohérente avec un risque donné.
 *
 * Le calcul est le même quel que soit l’instrument : `units × distance stop` doit valoir
 * le montant risqué. Le résultat est arrondi **vers le bas** au pas de lot — on ne risque
 * jamais plus que prévu. `null` si les saisies ne permettent pas de calculer.
 */
export function positionSize(input: PositionSizeInput, pipSize: number | null = null): PositionSize | null {
  const { balance, riskPct, entry, stop, direction, takeProfit = null } = input;
  if (!Number.isFinite(balance) || balance <= 0) return null;
  if (!Number.isFinite(riskPct) || riskPct <= 0) return null;
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(stop) || stop <= 0) return null;
  const stopDistance = Math.abs(entry - stop);
  if (stopDistance <= 0) return null;

  const contractSize =
    input.contractSize !== undefined && input.contractSize > 0 ? input.contractSize : DEFAULT_CONTRACT_SIZE;
  const lotStep = input.lotStep !== undefined && input.lotStep > 0 ? input.lotStep : DEFAULT_LOT_STEP;

  const riskAmount = Math.round((balance * riskPct) / 100 * 100) / 100;
  const lots = floorStep(riskAmount / (stopDistance * contractSize), lotStep);
  const units = Math.round(lots * contractSize * 100) / 100;
  const actualRisk = Math.round(units * stopDistance * 100) / 100;

  let rr: number | null = null;
  let potential: number | null = null;
  if (takeProfit !== null && Number.isFinite(takeProfit) && Math.abs(takeProfit - entry) > 0) {
    const target = Math.abs(takeProfit - entry);
    rr = Math.round((target / stopDistance) * 100) / 100;
    potential = Math.round(units * target * 100) / 100;
  }

  const stopPips =
    pipSize !== null && pipSize > 0 ? Math.round((stopDistance / pipSize) * 10) / 10 : null;

  return {
    riskAmount,
    stopDistance,
    stopPips,
    units,
    lots,
    actualRisk,
    rr,
    potential,
    stopOnWrongSide: direction === 'long' ? stop > entry : stop < entry,
  };
}

/**
 * Taille du pip la plus probable pour un instrument (approximation indicative) :
 * JPY à 0,01, or à 0,1, argent à 0,01, paires de devises classiques à 0,0001.
 * Les indices, actions et crypto ne sont pas devinés (null : la distance reste en prix).
 *
 * Les futures ne se mesurent pas en pips : la distance se lit en ticks, avec les constantes
 * du contrat (voir lib/futures.ts), donc on s'arrête ici.
 */
export function inferPipSize(instrument: string): number | null {
  const sym = instrument.trim().toUpperCase();
  if (sym.length === 0) return null;
  if (findFuturesContract(sym)) return null;
  if (/^(XAU|GOLD)/.test(sym)) return 0.1;
  if (/^(XAG|SILVER)/.test(sym)) return 0.01;
  if (/JPY/.test(sym)) return 0.01;
  // Six lettres façon « EURUSD » = paire de devise, sauf les crypto majeures (BTCUSD, ETHUSD…)
  // qui ont la même forme mais un tout autre ordre de grandeur.
  if (/^[A-Z]{6}$/.test(sym) && !/^(BTC|ETH|SOL|XRP|LTC|BNB|ADA|DOGE|DOT)/.test(sym)) return 0.0001;
  return null;
}
