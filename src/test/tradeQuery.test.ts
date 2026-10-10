import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUERY,
  MAX_VIEWS,
  OPTIONAL_COLUMNS,
  addView,
  filterTrades,
  paginate,
  parseColumns,
  parseTradeQuery,
  parseViews,
  removeView,
  sortTrades,
  tradeQueryString,
  writeTradeQuery,
  type TradeQuery,
} from '../lib/tradeQuery';
import { makeTrade } from './fixtures';

const ids = (list: { id: string }[]) => list.map((t) => t.id);

// t1 : gain, respecte le plan, setup et tag ; t2 : perte, vente, plan non suivi ; t3 : break-even, sans risque, autre compte
const t1 = makeTrade({ id: 't1', account_id: 'a1', instrument: 'EURUSD', direction: 'long', opened_at: '2026-10-01T08:00:00Z', closed_at: '2026-10-01T10:00:00Z', gross_pnl: 200, fees: 0, risk_amount: 100, plan_respected: true, setup: 'breakout', tags: ['london'] });
const t2 = makeTrade({ id: 't2', account_id: 'a1', instrument: 'NQ', direction: 'short', opened_at: '2026-10-02T13:00:00Z', closed_at: '2026-10-02T14:00:00Z', gross_pnl: -150, fees: 10, risk_amount: 100, plan_respected: false, setup: null });
const t3 = makeTrade({ id: 't3', account_id: 'a2', instrument: 'EURUSD', direction: 'long', opened_at: '2026-10-03T09:00:00Z', closed_at: '2026-10-03T09:30:00Z', gross_pnl: 0, fees: 0, risk_amount: null, plan_respected: null, setup: null });
const all = [t1, t2, t3];

describe('URL des trades', () => {
  it('lit les valeurs par défaut quand l’URL est vide', () => {
    expect(parseTradeQuery(new URLSearchParams(''))).toEqual(DEFAULT_QUERY);
  });

  it('ramène les valeurs inconnues à leur défaut', () => {
    const query = parseTradeQuery(new URLSearchParams('outcome=foo&side=long&sort=pnl&dir=asc&from=2026-10-01&to=bad&page=-3&account=acc-1'));
    expect(query).toMatchObject({ outcome: 'all', side: 'long', sort: 'pnl', dir: 'asc', from: '2026-10-01', to: '', page: 1, account: 'acc-1' });
  });

  it('n’écrit que les valeurs différentes du défaut et conserve les autres paramètres', () => {
    const written = writeTradeQuery(new URLSearchParams('trade=t-9'), { ...DEFAULT_QUERY, side: 'short', page: 1 });
    expect(written.get('trade')).toBe('t-9');
    expect(written.get('side')).toBe('short');
    expect(written.has('page')).toBe(false);
    expect(written.has('outcome')).toBe(false);
  });

  it('relit ce qu’elle a écrit (aller-retour)', () => {
    const query: TradeQuery = { ...DEFAULT_QUERY, account: 'a1', outcome: 'loss', side: 'short', plan: 'no', q: 'nq', from: '2026-10-01', to: '2026-10-09', sort: 'r', dir: 'asc', page: 3 };
    expect(parseTradeQuery(writeTradeQuery(new URLSearchParams(), query))).toEqual(query);
  });

  it('exclut la page des vues enregistrées', () => {
    expect(tradeQueryString({ ...DEFAULT_QUERY, page: 4, side: 'long' })).toBe('side=long');
  });
});

describe('filtres des trades', () => {
  const run = (patch: Partial<TradeQuery>, hidden?: Set<string>) => ids(filterTrades(all, { ...DEFAULT_QUERY, ...patch }, 'UTC', hidden));

  it('filtre par jour de clôture (bornes incluses)', () => {
    expect(run({ from: '2026-10-02', to: '2026-10-02' })).toEqual(['t2']);
    expect(run({ from: '2026-10-02' })).toEqual(['t2', 't3']);
    expect(run({ to: '2026-10-01' })).toEqual(['t1']);
  });

  it('filtre par résultat, sens, plan et compte', () => {
    expect(run({ outcome: 'win' })).toEqual(['t1']);
    expect(run({ outcome: 'loss' })).toEqual(['t2']);
    expect(run({ outcome: 'be' })).toEqual(['t3']);
    expect(run({ side: 'short' })).toEqual(['t2']);
    expect(run({ plan: 'yes' })).toEqual(['t1']);
    expect(run({ plan: 'no' })).toEqual(['t2']);
    expect(run({ account: 'a2' })).toEqual(['t3']);
  });

  it('cherche dans l’instrument, le setup et les tags', () => {
    expect(run({ q: 'eurusd' })).toEqual(['t1', 't3']);
    expect(run({ q: 'LONDON' })).toEqual(['t1']);
    expect(run({ q: '  breakout ' })).toEqual(['t1']);
  });

  it('masque les trades en attente de suppression', () => {
    expect(run({}, new Set(['t1']))).toEqual(['t2', 't3']);
  });
});

describe('tri des trades', () => {
  it('trie par P&L dans les deux sens', () => {
    expect(ids(sortTrades(all, 'pnl', 'desc'))).toEqual(['t1', 't3', 't2']);
    expect(ids(sortTrades(all, 'pnl', 'asc'))).toEqual(['t2', 't3', 't1']);
  });

  it('place les R absents en fin de liste, quelle que soit la direction', () => {
    expect(ids(sortTrades(all, 'r', 'desc'))).toEqual(['t1', 't2', 't3']);
    expect(ids(sortTrades(all, 'r', 'asc'))).toEqual(['t2', 't1', 't3']);
  });

  it('trie le texte en français et départage par date (plus récent d’abord)', () => {
    expect(ids(sortTrades(all, 'instrument', 'asc'))).toEqual(['t3', 't1', 't2']);
    expect(ids(sortTrades(all, 'setup', 'asc'))).toEqual(['t1', 't3', 't2']);
  });

  it('trie par date de clôture', () => {
    expect(ids(sortTrades(all, 'opened', 'desc'))).toEqual(['t3', 't2', 't1']);
    expect(ids(sortTrades(all, 'opened', 'asc'))).toEqual(['t1', 't2', 't3']);
  });
});

describe('pagination', () => {
  it('garde au moins une page, même sans trade', () => {
    expect(paginate(0, 1, 50)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0 });
  });

  it('calcule la tranche de la page demandée', () => {
    expect(paginate(120, 3, 50)).toEqual({ page: 3, pageCount: 3, start: 100, end: 120 });
  });

  it('ramène la page hors bornes dans les limites', () => {
    expect(paginate(120, 9, 50).page).toBe(3);
    expect(paginate(120, 0, 50).page).toBe(1);
  });
});

describe('colonnes et vues', () => {
  it('affiche toutes les colonnes optionnelles sans préférence enregistrée', () => {
    expect(parseColumns(null)).toEqual([...OPTIONAL_COLUMNS]);
    expect(parseColumns('{"a":1}')).toEqual([...OPTIONAL_COLUMNS]);
    expect(parseColumns('pas du json')).toEqual([...OPTIONAL_COLUMNS]);
  });

  it('garde les colonnes valides, dans l’ordre du tableau', () => {
    expect(parseColumns('["r","account","bogus"]')).toEqual(['account', 'r']);
  });

  it('lit les vues valides et ignore le reste', () => {
    expect(parseViews(null)).toEqual([]);
    expect(parseViews('x')).toEqual([]);
    const views = parseViews('[{"id":"1","name":"A","query":"side=long"},{"bad":true}]');
    expect(views).toEqual([{ id: '1', name: 'A', query: 'side=long' }]);
  });

  it('ajoute une vue au nom nettoyé, ignore un nom vide, remplace un nom identique', () => {
    const added = addView([], '  Shorts  ', 'side=short');
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ name: 'Shorts', query: 'side=short' });
    const same = [...added];
    expect(addView(same, '   ', 'x')).toBe(same);
    const replaced = addView(added, 'Shorts', 'side=short&outcome=loss');
    expect(replaced).toHaveLength(1);
    expect(replaced[0].query).toBe('side=short&outcome=loss');
  });

  it('limite le nombre de vues et supprime une vue par identifiant', () => {
    let views = [] as ReturnType<typeof addView>;
    for (let i = 0; i < MAX_VIEWS + 1; i += 1) views = addView(views, `Vue ${i}`, `page=${i}`);
    expect(views).toHaveLength(MAX_VIEWS);
    expect(views[0].name).toBe('Vue 1');
    expect(removeView(views, views[0].id)).toHaveLength(MAX_VIEWS - 1);
  });
});

describe('filtre par statut (positions ouvertes)', () => {
  const trades = [
    makeTrade({ id: 'closed', closed_at: '2026-10-05T09:00:00.000Z' }),
    makeTrade({ id: 'open', closed_at: null }),
  ];

  it('garde les positions ouvertes ou clôturées selon le filtre', () => {
    const open = filterTrades(trades, { ...DEFAULT_QUERY, state: 'open' }, 'UTC');
    expect(ids(open)).toEqual(['open']);
    const closed = filterTrades(trades, { ...DEFAULT_QUERY, state: 'closed' }, 'UTC');
    expect(ids(closed)).toEqual(['closed']);
    expect(filterTrades(trades, DEFAULT_QUERY, 'UTC')).toHaveLength(2);
  });

  it('lit et écrit le statut dans l’URL', () => {
    expect(parseTradeQuery(new URLSearchParams('state=open')).state).toBe('open');
    expect(parseTradeQuery(new URLSearchParams('state=inconnu')).state).toBe('all');
    expect(writeTradeQuery(new URLSearchParams(), { ...DEFAULT_QUERY, state: 'closed' }).get('state')).toBe('closed');
    expect(writeTradeQuery(new URLSearchParams(), DEFAULT_QUERY).get('state')).toBeNull();
  });
});
