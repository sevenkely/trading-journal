import type { Direction } from './types';

/**
 * Marché futures : le calcul ne se fait pas en lots ni en pips mais **par contrat**.
 *
 * Chaque contrat a deux constantes qui déterminent tout le reste :
 * - `tickSize` : le plus petit mouvement de prix coté (0,25 point sur le NQ) ;
 * - `tickValue` : ce que rapporte ou coûte un tick, pour un contrat (5 $ sur le NQ).
 *
 * Le multiplicateur (valeur d'un point complet) s'en déduit : tickValue / tickSize.
 * Ex. NQ : 5 / 0,25 = 20 $ par point. ES : 12,50 / 0,25 = 50 $ par point.
 */

export type FuturesCategory = 'indice' | 'metal' | 'energie' | 'taux' | 'devise' | 'crypto';

export interface FuturesContract {
  /** Racine du symbole, telle qu'on la tape sur la plateforme (NQ, MNQ, GC…). */
  root: string;
  /** Nom lisible du contrat. */
  name: string;
  /** Place de marché. */
  exchange: string;
  category: FuturesCategory;
  /** Plus petit mouvement de prix coté. */
  tickSize: number;
  /** Valeur d'un tick pour un contrat, en USD. */
  tickValue: number;
  /** Racine du contrat micro équivalent, quand il existe. */
  micro?: string;
}

/** Contrats couverts, du plus gros au micro. Les micros servent de repli quand un contrat est trop gros. */
export const FUTURES_CONTRACTS: readonly FuturesContract[] = [
  // Indices
  { root: 'ES', name: 'E-mini S&P 500', exchange: 'CME', category: 'indice', tickSize: 0.25, tickValue: 12.5, micro: 'MES' },
  { root: 'MES', name: 'Micro E-mini S&P 500', exchange: 'CME', category: 'indice', tickSize: 0.25, tickValue: 1.25 },
  { root: 'NQ', name: 'E-mini Nasdaq-100', exchange: 'CME', category: 'indice', tickSize: 0.25, tickValue: 5, micro: 'MNQ' },
  { root: 'MNQ', name: 'Micro E-mini Nasdaq-100', exchange: 'CME', category: 'indice', tickSize: 0.25, tickValue: 0.5 },
  { root: 'YM', name: 'E-mini Dow', exchange: 'CBOT', category: 'indice', tickSize: 1, tickValue: 5, micro: 'MYM' },
  { root: 'MYM', name: 'Micro E-mini Dow', exchange: 'CBOT', category: 'indice', tickSize: 1, tickValue: 0.5 },
  { root: 'RTY', name: 'E-mini Russell 2000', exchange: 'CME', category: 'indice', tickSize: 0.1, tickValue: 5, micro: 'M2K' },
  { root: 'M2K', name: 'Micro E-mini Russell 2000', exchange: 'CME', category: 'indice', tickSize: 0.1, tickValue: 0.5 },
  // Métaux
  { root: 'GC', name: 'Or (100 oz)', exchange: 'COMEX', category: 'metal', tickSize: 0.1, tickValue: 10, micro: 'MGC' },
  { root: 'MGC', name: 'Micro or (10 oz)', exchange: 'COMEX', category: 'metal', tickSize: 0.1, tickValue: 1 },
  { root: 'SI', name: 'Argent (5 000 oz)', exchange: 'COMEX', category: 'metal', tickSize: 0.005, tickValue: 25, micro: 'SIL' },
  { root: 'SIL', name: 'Micro argent (1 000 oz)', exchange: 'COMEX', category: 'metal', tickSize: 0.005, tickValue: 5 },
  { root: 'HG', name: 'Cuivre (25 000 lb)', exchange: 'COMEX', category: 'metal', tickSize: 0.0005, tickValue: 12.5, micro: 'MHG' },
  { root: 'MHG', name: 'Micro cuivre (2 500 lb)', exchange: 'COMEX', category: 'metal', tickSize: 0.0005, tickValue: 1.25 },
  // Énergie
  { root: 'CL', name: 'Pétrole WTI (1 000 barils)', exchange: 'NYMEX', category: 'energie', tickSize: 0.01, tickValue: 10, micro: 'MCL' },
  { root: 'MCL', name: 'Micro WTI (100 barils)', exchange: 'NYMEX', category: 'energie', tickSize: 0.01, tickValue: 1 },
  { root: 'NG', name: 'Gaz naturel (10 000 mmBtu)', exchange: 'NYMEX', category: 'energie', tickSize: 0.001, tickValue: 10, micro: 'MNG' },
  { root: 'MNG', name: 'Micro gaz naturel (2 500 mmBtu)', exchange: 'NYMEX', category: 'energie', tickSize: 0.001, tickValue: 2.5 },
  // Taux
  { root: 'ZN', name: 'T-Note 10 ans', exchange: 'CBOT', category: 'taux', tickSize: 0.015625, tickValue: 15.625 },
  { root: 'ZB', name: 'T-Bond 30 ans', exchange: 'CBOT', category: 'taux', tickSize: 0.03125, tickValue: 31.25 },
  // Devises
  { root: '6E', name: 'Euro FX (125 000 €)', exchange: 'CME', category: 'devise', tickSize: 0.00005, tickValue: 6.25 },
  { root: '6B', name: 'Livre sterling (62 500 £)', exchange: 'CME', category: 'devise', tickSize: 0.0001, tickValue: 6.25 },
  { root: '6J', name: 'Yen japonais (12 500 000 ¥)', exchange: 'CME', category: 'devise', tickSize: 0.0000005, tickValue: 6.25 },
  // Crypto
  { root: 'BTC', name: 'Bitcoin (5 BTC)', exchange: 'CME', category: 'crypto', tickSize: 5, tickValue: 25, micro: 'MBT' },
  { root: 'MBT', name: 'Micro bitcoin (0,1 BTC)', exchange: 'CME', category: 'crypto', tickSize: 5, tickValue: 0.5 },
  { root: 'ETH', name: 'Ether (50 ETH)', exchange: 'CME', category: 'crypto', tickSize: 0.05, tickValue: 2.5, micro: 'MET' },
  { root: 'MET', name: 'Micro ether (0,1 ETH)', exchange: 'CME', category: 'crypto', tickSize: 0.05, tickValue: 0.005 },
];

const BY_ROOT = new Map<string, FuturesContract>(FUTURES_CONTRACTS.map((c) => [c.root, c]));

/** Nom des mois dans les codes d'échéance des futures (F = janvier, Z = décembre). */
export const MONTH_CODES: Record<string, string> = {
  F: 'janvier',
  G: 'février',
  H: 'mars',
  J: 'avril',
  K: 'mai',
  M: 'juin',
  N: 'juillet',
  Q: 'août',
  U: 'septembre',
  V: 'octobre',
  X: 'novembre',
  Z: 'décembre',
};

/** Le contrat d'une racine donnée, ou null si l'instrument n'est pas un future connu. */
export function futuresContract(root: string): FuturesContract | null {
  return BY_ROOT.get(root.trim().toUpperCase()) ?? null;
}

/**
 * Valeur d'un point complet (1,00 de mouvement de prix) pour un contrat.
 * Les ticks décimaux flottent (12,5 / 0,0005 = 24 999,999999999996) : on coupe la poussière
 * pour retrouver 25 000 ou 1 000 pile, sans quoi les comparaisons et les arrondis dérivent.
 */
export function futuresMultiplier(contract: FuturesContract): number {
  return round(contract.tickValue / contract.tickSize, 6);
}

export interface ParsedFuturesSymbol {
  contract: FuturesContract;
  /** Symbole normalisé sans décoration : « NQH6 », « MNQ », « GC ». */
  symbol: string;
  /** Échéance lue (H6, Z2026, 03-26…), null si le symbole ne porte pas d'échéance. */
  expiry: string | null;
  /** Échéance en clair (« juin 2026 »), null si illisible. */
  expiryLabel: string | null;
  /** Symbole de contrat continu (@NQ1!, NQ=F) ou racine seule (NQ). */
  continuous: boolean;
}

/**
 * Reconnaît un symbole futures et sa racine : « NQH6 », « mnq z5 », « NQ 03-26 », « @NQ1! »,
 * « NQ=F », « ESZ2026 ». Renvoie null pour tout autre instrument (EURUSD, XAUUSD, actions…).
 *
 * La racine est le préfixe le plus long connu, puis ce qui reste doit ressembler à une échéance —
 * sinon on refuse : « SILVER » ne doit pas devenir le contrat SIL.
 */
export function parseFuturesSymbol(instrument: string, now: Date = new Date()): ParsedFuturesSymbol | null {
  const raw = instrument.trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return null;

  let body = raw;
  let continuous = false;
  if (body.startsWith('@')) {
    continuous = true;
    body = body.slice(1);
  }
  if (body.endsWith('=F')) {
    continuous = true;
    body = body.slice(0, -2);
  } else if (body.endsWith('!')) {
    continuous = true;
    body = body.replace(/\d*!$/, '');
  }
  if (!body) return null;

  let contract: FuturesContract | null = null;
  for (const candidate of FUTURES_CONTRACTS) {
    if (body.startsWith(candidate.root) && (!contract || candidate.root.length > contract.root.length)) {
      contract = candidate;
    }
  }
  if (!contract) return null;

  const suffix = body.slice(contract.root.length);
  const labelled = suffix ? expiryLabel(suffix, now) : null;
  // Une racine suivie d'autre chose qu'une échéance (SILVER, CLOUD…) n'est pas un future.
  if (suffix && !labelled) return null;

  return {
    contract,
    symbol: suffix ? `${contract.root}${suffix}` : contract.root,
    expiry: suffix || null,
    expiryLabel: suffix ? labelled : null,
    continuous: continuous || suffix === '',
  };
}

/** Contrat reconnu pour un instrument quelconque, ou null. */
export function findFuturesContract(instrument: string): FuturesContract | null {
  return parseFuturesSymbol(instrument)?.contract ?? null;
}

/** « H6 » ou « 03-26 » → « juin 2026 ». null si le code ne veut rien dire. */
export function expiryLabel(expiry: string, now: Date = new Date()): string | null {
  const code = expiry.trim().toUpperCase();
  const monthFirst = /^([FGHJKMNQUVXZ])(\d{1,4})$/.exec(code);
  if (monthFirst) {
    const month = MONTH_CODES[monthFirst[1]];
    const year = resolveYear(monthFirst[2], now);
    return year === null ? null : `${month} ${year}`;
  }
  const digitsFirst = /^(\d{1,2})-?(\d{2})$/.exec(code);
  if (digitsFirst) {
    const month = Number(digitsFirst[1]);
    if (month < 1 || month > 12) return null;
    const year = resolveYear(digitsFirst[2], now);
    if (year === null) return null;
    const name = Object.values(MONTH_CODES)[month - 1];
    return `${name} ${year}`;
  }
  return null;
}

/**
 * Année d'un code d'échéance : « 2026 » tel quel, « 26 » dans le siècle courant,
 * « 5 » dans la fenêtre de contrats cotés (l'année qui se termine par ce chiffre,
 * en partant de l'an dernier : Z5 lu en 2026 = décembre 2025, H1 = mars 2031).
 */
function resolveYear(digits: string, now: Date): number | null {
  const current = now.getFullYear();
  if (digits.length === 4) return Number(digits);
  if (digits.length === 2) return Math.floor(current / 100) * 100 + Number(digits);
  if (digits.length === 1) {
    const step = 10;
    for (let year = current - 1; year <= current - 1 + step; year += 1) {
      if (year % step === Number(digits)) return year;
    }
  }
  return null;
}

export interface FuturesPnlInput {
  contract: FuturesContract;
  direction: Direction;
  entry: number;
  exit: number;
  /** Nombre de contrats (entier ; 0 si la taille n'est pas encore saisie). */
  contracts: number;
}

export interface FuturesPnl {
  /** P&L brut, en USD, frais exclus. */
  grossPnl: number;
  /** Mouvement signé depuis le sens du trade, en points. */
  points: number;
  /** Mouvement signé, en ticks. */
  ticks: number;
  /** Valeur d'un point pour un contrat. */
  multiplier: number;
  /** Valeur notionale de la position (contrats × prix × multiplicateur). */
  notional: number;
}

/** P&L d'un trade futures, calculé avec les constantes du contrat — pas avec un lot générique. */
export function futuresPnl(input: FuturesPnlInput): FuturesPnl | null {
  const { contract, direction, entry, exit, contracts } = input;
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit) || exit <= 0) return null;
  if (!Number.isFinite(contracts) || contracts < 0) return null;
  const multiplier = futuresMultiplier(contract);
  const points = direction === 'long' ? exit - entry : entry - exit;
  return {
    grossPnl: round2(points * multiplier * contracts),
    points: round(points, 4),
    ticks: round(points / contract.tickSize, 2),
    multiplier,
    notional: round2(entry * multiplier * contracts),
  };
}

export interface FuturesSizeInput {
  contract: FuturesContract;
  /** Solde de référence, en USD (les marges des futures sont libellées en dollars). */
  balance: number;
  /** Part du solde risquée sur le trade, en pourcentage (1 = 1 %). */
  riskPct: number;
  entry: number;
  stop: number;
  direction: Direction;
  takeProfit?: number | null;
}

export interface FuturesSize {
  /** Montant risqué visé, en USD. */
  riskAmount: number;
  /** Distance entrée → stop, en prix. */
  stopDistance: number;
  /** Distance entrée → stop, en ticks (arrondi au centième de tick). */
  stopTicks: number;
  /** Ce que coûte le stop, pour un contrat. */
  riskPerContract: number;
  /** Nombre de contrats, entier, arrondi vers le bas — jamais plus que le risque visé. */
  contracts: number;
  /** Risque réel une fois arrondi. */
  actualRisk: number;
  multiplier: number;
  /** Valeur notionale de la position calculée. */
  notional: number;
  rr: number | null;
  potential: number | null;
  stopOnWrongSide: boolean;
  /** Repli sur le contrat micro quand le risque visé ne permet même pas un contrat plein. */
  micro: { contract: FuturesContract; contracts: number; actualRisk: number } | null;
}

/**
 * Taille futures : un contrat ne se fractionne pas, donc on arrondit **vers le bas** au contrat entier.
 * Quand le risque visé est plus petit qu'un contrat plein, on propose l'équivalent micro.
 */
export function futuresPositionSize(input: FuturesSizeInput): FuturesSize | null {
  const { contract, balance, riskPct, entry, stop, direction, takeProfit = null } = input;
  if (!Number.isFinite(balance) || balance <= 0) return null;
  if (!Number.isFinite(riskPct) || riskPct <= 0) return null;
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(stop) || stop <= 0) return null;

  const stopDistance = Math.abs(entry - stop);
  if (stopDistance <= 0) return null;

  const multiplier = futuresMultiplier(contract);
  const stopTicks = round(stopDistance / contract.tickSize, 2);
  const riskPerContract = round2(stopTicks * contract.tickValue);
  const riskAmount = round2((balance * riskPct) / 100);
  const contracts = riskPerContract > 0 ? Math.floor(riskAmount / riskPerContract + 1e-9) : 0;
  const actualRisk = round2(contracts * riskPerContract);

  let rr: number | null = null;
  let potential: number | null = null;
  if (takeProfit !== null && Number.isFinite(takeProfit) && Math.abs(takeProfit - entry) > 0) {
    const target = Math.abs(takeProfit - entry);
    rr = round(target / stopDistance, 2);
    potential = round2(target * multiplier * contracts);
  }

  const fallback = microFallback(contract, riskAmount, stopDistance, contracts);

  return {
    riskAmount,
    stopDistance: round(stopDistance, 6),
    stopTicks,
    riskPerContract,
    contracts,
    actualRisk,
    multiplier,
    notional: round2(contracts * entry * multiplier),
    rr,
    potential,
    stopOnWrongSide: direction === 'long' ? stop > entry : stop < entry,
    micro: fallback,
  };
}

function microFallback(
  contract: FuturesContract,
  riskAmount: number,
  stopDistance: number,
  contracts: number,
): FuturesSize['micro'] {
  if (contracts > 0 || !contract.micro) return null;
  const micro = futuresContract(contract.micro);
  if (!micro) return null;
  const ticks = round(stopDistance / micro.tickSize, 2);
  const riskPerContract = round2(ticks * micro.tickValue);
  const microContracts = riskPerContract > 0 ? Math.floor(riskAmount / riskPerContract + 1e-9) : 0;
  if (microContracts <= 0) return null;
  return { contract: micro, contracts: microContracts, actualRisk: round2(microContracts * riskPerContract) };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function round2(value: number): number {
  return round(value, 2);
}
