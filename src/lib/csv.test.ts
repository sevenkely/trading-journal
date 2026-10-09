import { describe, expect, it } from 'vitest';
import {
  decodeFileBuffer,
  guessMapping,
  hashString,
  parseCsv,
  parseDateTime,
  parseDirection,
  parseNumber,
  rowsToTrades,
  tradesToCsv,
  emptyMapping,
} from './csv';
import { makeTrade } from '../test/fixtures';

describe('parseNumber', () => {
  it('lit les nombres aux formats français et anglais', () => {
    expect(parseNumber('1 234,56')).toBe(1234.56);
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('$10')).toBe(10);
    expect(parseNumber('(12.5)')).toBe(-12.5);
    expect(parseNumber('-3,5')).toBe(-3.5);
  });

  it('renvoie null quand la valeur est vide ou illisible', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('-')).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('parseDateTime', () => {
  it('lit le format MT5 (année en tête) dans le fuseau donné', () => {
    expect(parseDateTime('2026.10.08 14:35:12', 'ymd', 'UTC')).toBe('2026-10-08T14:35:12.000Z');
  });

  it('lit un format européen jour/mois dans Paris', () => {
    expect(parseDateTime('08/10/2026 14:35', 'dmy', 'Europe/Paris')).toBe('2026-10-08T12:35:00.000Z');
  });

  it('gère l’AM/PM', () => {
    expect(parseDateTime('10/08/2026 2:35 PM', 'mdy', 'UTC')).toBe('2026-10-08T14:35:00.000Z');
    expect(parseDateTime('10/08/2026 12:05 AM', 'mdy', 'UTC')).toBe('2026-10-08T00:05:00.000Z');
  });

  it('devine l’ordre des dates quand il est non ambigu', () => {
    expect(parseDateTime('13/01/2026 10:00', 'auto', 'UTC')).toBe('2026-01-13T10:00:00.000Z');
    expect(parseDateTime('01/13/2026 10:00', 'auto', 'UTC')).toBe('2026-01-13T10:00:00.000Z');
  });

  it('respecte une date ISO qui porte déjà son fuseau', () => {
    expect(parseDateTime('2026-10-08T14:35:00+02:00', 'auto', 'UTC')).toBe('2026-10-08T12:35:00.000Z');
  });

  it('rejette les dates impossibles', () => {
    expect(parseDateTime('32/13/2026', 'dmy', 'UTC')).toBeNull();
    expect(parseDateTime('', 'auto', 'UTC')).toBeNull();
  });
});

describe('parseDirection', () => {
  it('reconnaît les sens en anglais et en français', () => {
    expect(parseDirection('Buy')).toBe('long');
    expect(parseDirection('achat')).toBe('long');
    expect(parseDirection('sell')).toBe('short');
    expect(parseDirection('Vente')).toBe('short');
    expect(parseDirection('foo')).toBeNull();
  });
});

describe('guessMapping', () => {
  it('associe les en-têtes courants aux champs de l’app', () => {
    const mapping = guessMapping(['Symbol', 'Side', 'Qty', 'Entry Time', 'Exit Time', 'Entry Price', 'Exit Price', 'Realized P&L', 'Commission']);
    expect(mapping.instrument).toBe('Symbol');
    expect(mapping.direction).toBe('Side');
    expect(mapping.size).toBe('Qty');
    expect(mapping.opened_at).toBe('Entry Time');
    expect(mapping.closed_at).toBe('Exit Time');
    expect(mapping.entry_price).toBe('Entry Price');
    expect(mapping.exit_price).toBe('Exit Price');
    expect(mapping.pnl).toBe('Realized P&L');
    expect(mapping.commission).toBe('Commission');
    expect(mapping.swap).toBe('');
  });
});

describe('parseCsv et rowsToTrades', () => {
  const text = [
    'Symbol;Side;Qty;Entry Time;Exit Time;Entry Price;Exit Price;Realized P&L;Commission',
    'EURUSD;Buy;1;08/10/2026 09:00;08/10/2026 10:00;1,1000;1,1050;500;-3',
    'NQ;Sell;2;08/10/2026 14:00;;;;-200;-4',
    'XAU;Buy;1;xx;;;;100;',
  ].join('\n');

  it('transforme les lignes en trades et signale les lignes invalides', () => {
    const parsed = parseCsv(text);
    const result = rowsToTrades(
      parsed,
      { mapping: guessMapping(parsed.headers), timezone: 'UTC', dateOrder: 'dmy', pnlIsNet: false },
      'acc-1',
    );

    expect(result.total).toBe(3);
    expect(result.trades).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Ligne 4');

    const [first, second] = result.trades;
    expect(first.instrument).toBe('EURUSD');
    expect(first.direction).toBe('long');
    expect(first.opened_at).toBe('2026-10-08T09:00:00.000Z');
    expect(first.closed_at).toBe('2026-10-08T10:00:00.000Z');
    expect(first.entry_price).toBe(1.1);
    expect(first.gross_pnl).toBe(500);
    expect(first.fees).toBe(3);
    expect(first.source).toBe('import');

    expect(second.direction).toBe('short');
    expect(second.closed_at).toBeNull();
    expect(second.gross_pnl).toBe(-200);
    expect(second.fees).toBe(4);
  });

  it('produit le même identifiant externe pour la même ligne (détection des doublons)', () => {
    const parsed = parseCsv(text);
    const options = { mapping: guessMapping(parsed.headers), timezone: 'UTC', dateOrder: 'dmy' as const, pnlIsNet: false };
    const a = rowsToTrades(parsed, options, 'acc-1').trades[0].external_id;
    const b = rowsToTrades(parsed, options, 'acc-1').trades[0].external_id;
    const other = rowsToTrades(parsed, options, 'acc-2').trades[0].external_id;
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });

  it('considère le P&L comme net quand la case est cochée', () => {
    const parsed = parseCsv(text);
    const result = rowsToTrades(
      parsed,
      { mapping: guessMapping(parsed.headers), timezone: 'UTC', dateOrder: 'dmy', pnlIsNet: true },
      'acc-1',
    );
    expect(result.trades[0].fees).toBe(0);
  });

  it('retire le BOM et lit les fichiers UTF-16 des rapports MetaTrader', () => {
    expect(parseCsv('\uFEFFSymbol;Profit\nEURUSD;10').headers).toEqual(['Symbol', 'Profit']);

    const bytes = [0xff, 0xfe];
    for (const ch of 'Symbol;Profit') {
      const code = ch.charCodeAt(0);
      bytes.push(code & 0xff, code >> 8);
    }
    expect(decodeFileBuffer(new Uint8Array(bytes).buffer)).toBe('Symbol;Profit');

    const utf8 = new TextEncoder().encode('\uFEFFAbc');
    expect(decodeFileBuffer(utf8.buffer)).toBe('Abc');
  });
});

describe('tradesToCsv', () => {
  it('exporte avec séparateur « ; », virgule décimale et BOM', () => {
    const trade = makeTrade({
      id: 'x',
      instrument: 'EURUSD',
      gross_pnl: 500,
      fees: 3,
      entry_price: 1.1,
      exit_price: 1.105,
      notes: 'Entrée propre; pas de news',
      emotions_before: ['Calme'],
    });
    const csv = tradesToCsv([trade], new Map([['a1', 'FTMO 100k']]));
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const [header, line] = csv.replace('\uFEFF', '').split('\r\n');
    expect(header.split(';')).toContain('P&L net');
    expect(line).toContain('EURUSD');
    expect(line).toContain('FTMO 100k');
    expect(line).toContain('1,1');
    expect(line).toContain('497');
    expect(line).toContain('"Entrée propre; pas de news"');
  });

  it('calcule le R quand le risque est renseigné', () => {
    const csv = tradesToCsv([makeTrade({ gross_pnl: 200, risk_amount: 100 })], new Map());
    expect(csv).toContain(';2;');
  });
});

describe('hashString', () => {
  it('est stable et différencie les entrées', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('emptyMapping', () => {
  it('ne mappe aucune colonne', () => {
    expect(Object.values(emptyMapping()).every((v) => v === '')).toBe(true);
  });
});
