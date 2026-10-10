import { round2 } from './utils';

/**
 * Risque de ruine par simulation de Monte-Carlo.
 *
 * On rejoue la distribution de R **observée** sur le compte, dans un ordre tiré au hasard,
 * avec un montant risqué fixe par trade, et on regarde ce qui arrive le premier :
 * le seuil de perte maximale (« ruine ») ou l'objectif de profit.
 *
 * C'est une estimation, pas une prédiction : elle suppose que le futur ressemble à
 * l'échantillon, que le risque par trade ne change pas et que les trades sont indépendants.
 * Elle répond à une seule question utile : « avec ce risque par trade, quelle est la chance
 * de faire sauter le compte avant de valider l'objectif ? »
 */

export interface RuinInput {
  /** R multiples observés (P&L net ÷ risque). Un seul suffit, mais la dispersion fait tout. */
  samples: number[];
  /** Montant risqué par trade, dans la devise du compte */
  riskPerTrade: number;
  /** Distance au seuil de perte maximale (montant positif), ou null s'il n'y a pas de règle */
  maxLoss: number | null;
  /** Objectif de profit à atteindre (montant positif), ou null */
  target: number | null;
  /** Nombre de trades simulés par séquence */
  horizon: number;
  /** Nombre de séquences */
  simulations: number;
  /** true : le seuil suit le plus haut d'équité (trailing) ; false : seuil fixe */
  trailing?: boolean;
  /** Graine du tirage : même graine, mêmes résultats */
  seed?: number;
}

export interface RuinBand {
  step: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface RuinResult {
  /** Part des séquences qui touchent le seuil de perte avant l'objectif (0 à 1) */
  ruinProbability: number;
  /** Part des séquences qui atteignent l'objectif (0 à 1) */
  targetProbability: number;
  /** Part des séquences qui n'ont fait ni l'un ni l'autre dans l'horizon */
  unfinishedProbability: number;
  /** Nombre médian de trades avant l'objectif, null si jamais atteint */
  medianTradesToTarget: number | null;
  /** Pire baisse d'équité médiane parmi les séquences (montant positif) */
  medianWorstDrawdown: number;
  /** Couloirs d'équité par pas de temps, pour tracer l'éventail */
  bands: RuinBand[];
  simulations: number;
  horizon: number;
  riskPerTrade: number;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) : mêmes entrées, mêmes résultats. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(Float64Array.from(sorted), 0.5);
};

/**
 * Simule `simulations` séquences de `horizon` trades. Renvoie null si l'entrée n'est pas
 * exploitable (aucun R connu, ou risque par trade nul).
 */
export function monteCarloRuin(input: RuinInput): RuinResult | null {
  const samples = input.samples.filter((v) => Number.isFinite(v));
  const risk = input.riskPerTrade;
  if (samples.length === 0 || !(risk > 0)) return null;

  const simulations = Math.max(1, Math.floor(input.simulations));
  const horizon = Math.max(1, Math.floor(input.horizon));
  const { maxLoss, target, trailing = false } = input;
  const random = mulberry32(input.seed ?? 1);

  const width = horizon + 1;
  const equity = new Float32Array(simulations * width);
  let ruins = 0;
  let targets = 0;
  const stepsToTarget: number[] = [];
  const worstDrawdowns: number[] = [];

  for (let sim = 0; sim < simulations; sim++) {
    const base = sim * width;
    let current = 0;
    let peak = 0;
    let worst = 0;
    let done: 'open' | 'ruin' | 'target' = 'open';
    equity[base] = 0;

    for (let step = 1; step <= horizon; step++) {
      if (done === 'open') {
        current += samples[Math.floor(random() * samples.length)] * risk;
        peak = Math.max(peak, current);
        worst = Math.min(worst, current - peak);
        const floor = maxLoss === null ? null : trailing ? Math.min(peak - maxLoss, 0) : -maxLoss;
        if (floor !== null && current <= floor) {
          current = floor;
          done = 'ruin';
          ruins += 1;
        } else if (target !== null && current >= target) {
          done = 'target';
          targets += 1;
          stepsToTarget.push(step);
        }
      }
      equity[base + step] = current;
    }
    worstDrawdowns.push(-worst);
  }

  const bands: RuinBand[] = [];
  const column = new Float64Array(simulations);
  for (let step = 0; step <= horizon; step++) {
    for (let sim = 0; sim < simulations; sim++) column[sim] = equity[sim * width + step];
    column.sort();
    bands.push({
      step,
      p5: round2(percentile(column, 0.05)),
      p25: round2(percentile(column, 0.25)),
      p50: round2(percentile(column, 0.5)),
      p75: round2(percentile(column, 0.75)),
      p95: round2(percentile(column, 0.95)),
    });
  }

  return {
    ruinProbability: ruins / simulations,
    targetProbability: targets / simulations,
    unfinishedProbability: (simulations - ruins - targets) / simulations,
    medianTradesToTarget: median(stepsToTarget),
    medianWorstDrawdown: round2(median(worstDrawdowns) ?? 0),
    bands,
    simulations,
    horizon,
    riskPerTrade: risk,
  };
}
