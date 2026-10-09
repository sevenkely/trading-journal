import Papa from 'papaparse';
import type { Direction, Trade, TradeInput } from './types';
import { zonedTimeToIso } from './timezone';
import { sessionForDate, sortByTradeTime } from './metrics';
import { round2 } from './utils';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export type DateOrder = 'auto' | 'dmy' | 'mdy' | 'ymd';

/** Pour chaque champ de l'app, le nom de la colonne du fichier (chaîne vide = non mappé). */
export interface ColumnMapping {
  opened_at: string;
  closed_at: string;
  instrument: string;
  direction: string;
  size: string;
  entry_price: string;
  exit_price: string;
  stop_loss: string;
  take_profit: string;
  pnl: string;
  commission: string;
  swap: string;
}

export const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: 'opened_at', label: 'Date d’ouverture', required: true },
  { key: 'closed_at', label: 'Date de clôture', required: false },
  { key: 'instrument', label: 'Instrument / symbole', required: true },
  { key: 'direction', label: 'Sens (achat / vente)', required: true },
  { key: 'size', label: 'Taille (lots / contrats)', required: false },
  { key: 'entry_price', label: 'Prix d’entrée', required: false },
  { key: 'exit_price', label: 'Prix de sortie', required: false },
  { key: 'stop_loss', label: 'Stop loss', required: false },
  { key: 'take_profit', label: 'Take profit', required: false },
  { key: 'pnl', label: 'P&L (brut, ou net si coché plus bas)', required: true },
  { key: 'commission', label: 'Commissions', required: false },
  { key: 'swap', label: 'Swap / financement', required: false },
];

export interface CsvOptions {
  mapping: ColumnMapping;
  /** Fuseau dans lequel le fichier écrit ses dates */
  timezone: string;
  dateOrder: DateOrder;
  /** true si la colonne P&L contient déjà les frais (P&L net) */
  pnlIsNet: boolean;
}

export interface ImportResult {
  trades: TradeInput[];
  errors: string[];
  /** Nombre de lignes/positions lues dans le fichier */
  total: number;
}

export function emptyMapping(): ColumnMapping {
  return {
    opened_at: '',
    closed_at: '',
    instrument: '',
    direction: '',
    size: '',
    entry_price: '',
    exit_price: '',
    stop_loss: '',
    take_profit: '',
    pnl: '',
    commission: '',
    swap: '',
  };
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, '');
  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  return { headers: result.meta.fields ?? [], rows: result.data };
}

/** Lit un fichier (UTF-8, ou UTF-16 comme les rapports MT4/MT5). */
export function decodeFileBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[1] === 0 && bytes[0] !== 0) return new TextDecoder('utf-16le').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const CANDIDATES: Record<keyof ColumnMapping, string[]> = {
  opened_at: ['opentime', 'opendate', 'opendatetime', 'openedat', 'entrytime', 'entrydate', 'datetimeopen', 'starttime', 'time', 'date', 'datetime', 'timestamp'],
  closed_at: ['closetime', 'closedate', 'closedatetime', 'closedat', 'exittime', 'exitdate', 'datetimeclose', 'endtime', 'closed'],
  instrument: ['symbol', 'instrument', 'market', 'contract', 'product', 'pair', 'asset', 'ticker', 'item'],
  direction: ['type', 'side', 'direction', 'action', 'buysell', 'marketpos', 'marketposition', 'position'],
  size: ['volume', 'size', 'qty', 'quantity', 'lots', 'contracts', 'lot'],
  entry_price: ['openprice', 'entryprice', 'priceopen', 'avgentryprice', 'entry', 'buyprice'],
  exit_price: ['closeprice', 'exitprice', 'priceclose', 'avgexitprice', 'exit', 'sellprice'],
  stop_loss: ['sl', 'stoploss', 'stop'],
  take_profit: ['tp', 'takeprofit', 'target'],
  pnl: [
    'profit',
    'pnl',
    'pl',
    'netpnl',
    'netpl',
    'realizedpnl',
    'realizedpl',
    'realizedprofit',
    'profitloss',
    'netprofit',
    'grosspnl',
    'grosspl',
    'totalpl',
    'totalpnl',
  ],
  commission: ['commission', 'commissions', 'fees', 'fee'],
  swap: ['swap', 'swaps', 'rollover', 'financing'],
};

/** Devine le mapping des colonnes à partir des en-têtes (modifiable ensuite dans l'interface). */
export function guessMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((raw) => ({ raw, n: norm(raw) }));
  const mapping = emptyMapping();
  (Object.keys(CANDIDATES) as (keyof ColumnMapping)[]).forEach((key) => {
    for (const candidate of CANDIDATES[key]) {
      const hit = normalized.find((h) => h.n === candidate);
      if (hit) {
        mapping[key] = hit.raw;
        break;
      }
    }
  });
  return mapping;
}

/** Nombre tolérant : « 1 234,56 », « 1,234.56 », « (12.5) », « $10 ». */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = raw.replace(/[\s\u00a0\u202f]/g, '').replace(/[$€£¥]/g, '');
  if (!s || s === '-' || s === '.') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Lit une date « 2026.10.08 14:35:12 », « 08/10/2026 14:35 », « 10/08/2026 2:35 PM », ISO…
 * Les heures sont interprétées dans le fuseau `tz` puis converties en UTC.
 */
export function parseDateTime(raw: string | null | undefined, order: DateOrder, tz: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO avec fuseau explicite (Z ou +hh:mm) : la date est déjà absolue
  if (/T.*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const m = s.match(
    /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp][Mm])?)?/,
  );
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const [, a, b, c, hh, mm, ss, ampm] = m;
  let year: number;
  let month: number;
  let day: number;
  if (a.length === 4) {
    year = Number(a);
    month = Number(b);
    day = Number(c);
  } else {
    const first = Number(a);
    const second = Number(b);
    let dmy: boolean;
    if (order === 'dmy') dmy = true;
    else if (order === 'mdy') dmy = false;
    else if (first > 12) dmy = true;
    else if (second > 12) dmy = false;
    else dmy = true; // ambigu : on privilégie jour/mois (format européen)
    day = dmy ? first : second;
    month = dmy ? second : first;
    year = c.length === 2 ? 2000 + Number(c) : Number(c);
  }

  let hour = hh ? Number(hh) : 0;
  const minute = mm ? Number(mm) : 0;
  const second = ss ? Number(ss) : 0;
  if (ampm) {
    const pm = ampm.toLowerCase() === 'pm';
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  return zonedTimeToIso(year, month, day, hour, minute, second, tz);
}

export function parseDirection(raw: string | null | undefined): Direction | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/buy|long|achat|acheter/.test(s)) return 'long';
  if (/sell|short|vente|vendre/.test(s)) return 'short';
  return null;
}

/** Empreinte stable (cyrb53) : sert à détecter les doublons à l'import. */
export function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Transforme les lignes d'un CSV en trades, selon le mapping choisi. */
export function rowsToTrades(file: ParsedCsv, opts: CsvOptions, accountId: string): ImportResult {
  const m = opts.mapping;
  const trades: TradeInput[] = [];
  const errors: string[] = [];
  const cell = (row: Record<string, string>, key: keyof ColumnMapping): string | undefined =>
    m[key] ? row[m[key]] : undefined;

  file.rows.forEach((row, index) => {
    const line = index + 2; // la ligne 1 contient les en-têtes
    const instrument = (cell(row, 'instrument') ?? '').trim().toUpperCase();
    const direction = parseDirection(cell(row, 'direction'));
    const openedAt = parseDateTime(cell(row, 'opened_at'), opts.dateOrder, opts.timezone);
    const closedAt = parseDateTime(cell(row, 'closed_at'), opts.dateOrder, opts.timezone);
    const pnl = parseNumber(cell(row, 'pnl'));

    if (!instrument || !direction || !openedAt || pnl === null) {
      errors.push(`Ligne ${line} : instrument, sens, date ou P&L manquant ou illisible`);
      return;
    }

    const commission = Math.abs(parseNumber(cell(row, 'commission')) ?? 0);
    const swap = parseNumber(cell(row, 'swap')) ?? 0;
    const fees = opts.pnlIsNet ? 0 : commission - swap;
    const num = (key: keyof ColumnMapping) => parseNumber(cell(row, key));
    const size = num('size');
    const entry = num('entry_price');
    const exit = num('exit_price');
    const stop = num('stop_loss');
    const target = num('take_profit');

    const fingerprint = hashString(
      [accountId, openedAt, closedAt ?? '', instrument, direction, size ?? '', pnl, entry ?? '', exit ?? ''].join('|'),
    );

    trades.push({
      account_id: accountId,
      instrument,
      direction,
      opened_at: openedAt,
      closed_at: closedAt,
      entry_price: entry,
      exit_price: exit,
      stop_loss: stop || null,
      take_profit: target || null,
      size,
      risk_amount: null,
      gross_pnl: round2(pnl),
      fees: round2(fees),
      session: sessionForDate(openedAt),
      setup: null,
      timeframe: null,
      emotions_before: [],
      emotions_after: [],
      plan_respected: null,
      mistakes: [],
      checklist_done: [],
      notes: null,
      tags: [],
      source: 'import',
      external_id: `csv:${fingerprint}`,
      import_batch_id: null,
    });
  });

  return { trades, errors, total: file.rows.length };
}

const esc = (value: string) => (/[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const num = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value).replace('.', ','));

/** Export CSV (séparateur « ; », compatible Excel français). */
export function tradesToCsv(trades: Trade[], accountNames: Map<string, string>): string {
  const header = [
    'Ouverture',
    'Clôture',
    'Compte',
    'Instrument',
    'Sens',
    'Taille',
    'Entrée',
    'Sortie',
    'Stop',
    'Take profit',
    'P&L brut',
    'Frais',
    'P&L net',
    'R',
    'Setup',
    'Session',
    'Timeframe',
    'Plan respecté',
    'Émotions avant',
    'Émotions après',
    'Erreurs',
    'Notes',
  ];
  const lines = sortByTradeTime(trades).map((t) =>
    [
      new Date(t.opened_at).toLocaleString('fr-FR'),
      t.closed_at ? new Date(t.closed_at).toLocaleString('fr-FR') : '',
      accountNames.get(t.account_id) ?? '',
      t.instrument,
      t.direction === 'long' ? 'Achat' : 'Vente',
      num(t.size),
      num(t.entry_price),
      num(t.exit_price),
      num(t.stop_loss),
      num(t.take_profit),
      num(t.gross_pnl),
      num(t.fees),
      num(t.net_pnl),
      num(t.risk_amount ? round2(t.net_pnl / t.risk_amount) : null),
      t.setup ?? '',
      t.session ?? '',
      t.timeframe ?? '',
      t.plan_respected === null ? '' : t.plan_respected ? 'Oui' : 'Non',
      t.emotions_before.join(', '),
      t.emotions_after.join(', '),
      t.mistakes.join(', '),
      t.notes ?? '',
    ]
      .map((v) => esc(String(v)))
      .join(';'),
  );
  return `\uFEFF${[header.map(esc).join(';'), ...lines].join('\r\n')}`;
}
