import type { TradeInput } from './types';
import { hashString, parseDateTime, parseNumber } from './csv';
import type { ImportResult } from './csv';
import { sessionForDate } from './metrics';
import { round2 } from './utils';

type Field =
  | 'id'
  | 'symbol'
  | 'type'
  | 'volume'
  | 'openTime'
  | 'openPrice'
  | 'sl'
  | 'tp'
  | 'closeTime'
  | 'closePrice'
  | 'commission'
  | 'taxes'
  | 'swap'
  | 'profit';

type FieldIndex = Partial<Record<Field, number>>;

const clean = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Repère les colonnes d'un tableau « Positions » (MT5) ou « Account History » (MT4).
 * Renvoie null pour les autres tableaux (ordres, deals…).
 */
function buildIndex(lower: string[]): FieldIndex | null {
  const names = lower.map((h) => h.replace(/\s+/g, ''));
  const isPositions =
    (names.includes('position') || names.includes('ticket')) &&
    !names.includes('deal') &&
    !names.includes('order') &&
    names.includes('profit') &&
    (names.includes('symbol') || names.includes('item'));
  if (!isPositions) return null;

  const idx: FieldIndex = {};
  let timeSeen = 0;
  let priceSeen = 0;
  names.forEach((h, i) => {
    switch (h) {
      case 'position':
      case 'ticket':
        idx.id = i;
        break;
      case 'symbol':
      case 'item':
        idx.symbol = i;
        break;
      case 'type':
        idx.type = i;
        break;
      case 'volume':
      case 'size':
        idx.volume = i;
        break;
      case 'time':
        if (timeSeen === 0) idx.openTime = i;
        else idx.closeTime = i;
        timeSeen += 1;
        break;
      case 'opentime':
        idx.openTime = i;
        break;
      case 'closetime':
        idx.closeTime = i;
        break;
      case 'price':
        if (priceSeen === 0) idx.openPrice = i;
        else idx.closePrice = i;
        priceSeen += 1;
        break;
      case 's/l':
        idx.sl = i;
        break;
      case 't/p':
        idx.tp = i;
        break;
      case 'commission':
        idx.commission = i;
        break;
      case 'taxes':
        idx.taxes = i;
        break;
      case 'swap':
        idx.swap = i;
        break;
      case 'profit':
        idx.profit = i;
        break;
      default:
        break;
    }
  });
  return idx;
}

/**
 * Lit un rapport d'historique HTML exporté depuis MetaTrader 4/5.
 * Seules les positions clôturées (achat/vente) sont importées.
 */
export function parseMt5Html(html: string, accountId: string, timezone: string): ImportResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const trades: TradeInput[] = [];
  const errors: string[] = [];
  let total = 0;
  let index: FieldIndex | null = null;
  let sawPositions = false;

  for (const tr of Array.from(doc.querySelectorAll('tr'))) {
    const cells = Array.from(tr.children)
      .filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
      .map((c) => clean(c.textContent));
    if (cells.length === 0) continue;

    const lower = cells.map((c) => c.toLowerCase());
    if (['time', 'ticket', 'open time', 'order', 'deal'].includes(lower[0] ?? '')) {
      index = buildIndex(lower);
      if (index) sawPositions = true;
      continue;
    }
    const current = index;
    if (!current) continue;

    const get = (field: Field): string | undefined => {
      const i = current[field];
      return i === undefined ? undefined : cells[i];
    };

    const type = (get('type') ?? '').toLowerCase();
    if (type !== 'buy' && type !== 'sell') continue; // balance, crédit, etc.
    total += 1;

    const openedAt = parseDateTime(get('openTime'), 'ymd', timezone);
    const closedAt = parseDateTime(get('closeTime'), 'ymd', timezone);
    const profit = parseNumber(get('profit'));
    const symbol = (get('symbol') ?? '').toUpperCase();

    if (!openedAt || profit === null || !symbol) {
      errors.push(`Position ignorée (données illisibles) : ${cells.slice(0, 4).join(' | ')}`);
      continue;
    }

    const commission = Math.abs(parseNumber(get('commission')) ?? 0);
    const taxes = Math.abs(parseNumber(get('taxes')) ?? 0);
    const swap = parseNumber(get('swap')) ?? 0;
    const id = get('id');

    trades.push({
      account_id: accountId,
      instrument: symbol,
      direction: type === 'buy' ? 'long' : 'short',
      opened_at: openedAt,
      closed_at: closedAt,
      entry_price: parseNumber(get('openPrice')),
      exit_price: parseNumber(get('closePrice')),
      stop_loss: parseNumber(get('sl')) || null,
      take_profit: parseNumber(get('tp')) || null,
      size: parseNumber(get('volume')),
      risk_amount: null,
      gross_pnl: round2(profit),
      fees: round2(commission + taxes - swap),
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
      external_id: id ? `mt:${id}` : `mt:${hashString(cells.join('|'))}`,
      import_batch_id: null,
    });
  }

  if (!sawPositions) {
    errors.push(
      'Aucun tableau de positions trouvé dans ce fichier. Exporte l’historique du compte depuis MT5 en rapport HTML.',
    );
  }
  return { trades, errors, total };
}
