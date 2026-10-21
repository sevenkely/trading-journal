/**
 * Séries des micro-graphiques de fond (cellules de statistiques).
 * Aucune dépendance : on ne produit que des nombres, la géométrie vit dans le composant.
 */

/** Une valeur non finie (NaN, Infinity) vaut zéro : elle ne doit pas casser l'échelle. */
const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

/** Fenêtre utile : au moins 1, jamais plus que la série. */
function clampWindow(window: number, length: number): number {
  const size = Math.floor(Number.isFinite(window) ? window : 1);
  return Math.max(1, Math.min(size, Math.max(1, length)));
}

/**
 * Cumul précédé du point de départ : la courbe part de zéro et finit sur le total.
 * C'est la forme d'une courbe de P&L — elle coupe la ligne zéro quand le compte repasse à perte.
 */
export function cumulative(values: readonly number[]): number[] {
  let sum = 0;
  const out: number[] = [0];
  for (const value of values) {
    sum += finite(value);
    out.push(sum);
  }
  return out;
}

/** Moyenne glissante : la fenêtre se tronque au début plutôt que de retarder la courbe. */
export function rollingMean(values: readonly number[], window = 20): number[] {
  const size = clampWindow(window, values.length);
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += finite(values[i]);
    if (i >= size) sum -= finite(values[i - size]);
    const count = Math.min(i + 1, size);
    out.push(sum / count);
  }
  return out;
}

/** Part de `true` dans la fenêtre glissante, en pourcentage (0 à 100). */
export function rollingShare(flags: readonly boolean[], window = 20): number[] {
  const size = clampWindow(window, flags.length);
  const out: number[] = [];
  let hits = 0;
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i]) hits += 1;
    if (i >= size && flags[i - size]) hits -= 1;
    const count = Math.min(i + 1, size);
    out.push((hits / count) * 100);
  }
  return out;
}

/**
 * Profit factor glissant : gains bruts ÷ pertes brutes sur la fenêtre.
 * `Infinity` tant qu'aucune perte n'y figure — le tracé ignore ces points plutôt que de les inventer.
 */
export function rollingProfitFactor(values: readonly number[], window = 20): number[] {
  const size = clampWindow(window, values.length);
  const out: number[] = [];
  let gains = 0;
  let losses = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = finite(values[i]);
    if (value > 0) gains += value;
    else losses += -value;
    const leaving = i - size;
    if (leaving >= 0) {
      const old = finite(values[leaving]);
      if (old > 0) gains -= old;
      else losses -= -old;
    }
    out.push(losses > 0 ? gains / losses : Number.POSITIVE_INFINITY);
  }
  return out;
}

export interface SparkSets {
  /** P&L net cumulé */
  pnl: number[];
  /** Taux de réussite glissant, en % */
  winRate: number[];
  /** Profit factor glissant */
  profitFactor: number[];
  /** R moyen glissant (trades sans risque renseigné exclus) */
  avgR: number[];
}

/**
 * Les quatre séries d'une bande de statistiques, calculées en une passe sur les trades.
 * `nets` : P&L net de chaque trade ; `rs` : multiple de risque (null si le risque n'est pas renseigné).
 */
export function statSparks(nets: readonly number[], rs: readonly (number | null)[], window = 20): SparkSets {
  const risks = rs.filter((r): r is number => r !== null && Number.isFinite(r));
  return {
    pnl: cumulative(nets),
    winRate: rollingShare(nets.map((value) => finite(value) > 0), window),
    profitFactor: rollingProfitFactor(nets, window),
    avgR: rollingMean(risks, window),
  };
}
