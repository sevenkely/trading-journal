import { describe, expect, it } from 'vitest';
import { checklistMatch, findSetupByName, normalizeSetupName, resolveSetupRef, setupNameTaken } from './setups';
import type { Setup } from './types';

const setup = (overrides: Partial<Setup> = {}): Setup => ({
  id: 's1',
  name: 'ORB 5 min',
  description: null,
  htf: 'H4 au-dessus du VWAP',
  invalidation: 'Clôture sous le range',
  checklist: ['Range tracé', 'Volume présent'],
  created_at: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('noms de setups', () => {
  it('réduit les espaces et borne le nom', () => {
    expect(normalizeSetupName('  ORB   5   min ')).toBe('ORB 5 min');
    expect(normalizeSetupName('')).toBe('');
    expect(normalizeSetupName('a'.repeat(120))).toHaveLength(80);
  });

  it('retrouve un setup sans tenir compte de la casse', () => {
    const setups = [setup()];
    expect(findSetupByName(setups, 'orb 5 MIN')?.id).toBe('s1');
    expect(findSetupByName(setups, '  ')).toBeNull();
    expect(findSetupByName(setups, 'Sweep')).toBeNull();
  });

  it('détecte un nom déjà pris, sauf le setup qu’on renomme', () => {
    const setups = [setup(), setup({ id: 's2', name: 'Sweep de liquidité' })];
    expect(setupNameTaken(setups, ' orb 5 min ')).toBe(true);
    expect(setupNameTaken(setups, 'orb 5 min', 's1')).toBe(false);
    expect(setupNameTaken(setups, 'Retest')).toBe(false);
  });
});

describe('resolveSetupRef', () => {
  it('privilégie l’identifiant et prend le libellé de la bibliothèque', () => {
    expect(resolveSetupRef([setup()], { setup_id: 's1', setup: 'texte libre' })).toEqual({
      setup_id: 's1',
      setup: 'ORB 5 min',
    });
  });

  it('rattache par le nom quand l’identifiant manque', () => {
    expect(resolveSetupRef([setup()], { setup_id: null, setup: 'orb  5 min' })).toEqual({
      setup_id: 's1',
      setup: 'ORB 5 min',
    });
  });

  it('garde un libellé hors bibliothèque, sans lien', () => {
    expect(resolveSetupRef([setup()], { setup: '  Cassure de range  ' })).toEqual({
      setup_id: null,
      setup: 'Cassure de range',
    });
    expect(resolveSetupRef([setup()], {})).toEqual({ setup_id: null, setup: null });
  });
});

describe('checklistMatch', () => {
  it('compte les points communs sans tenir compte de la casse', () => {
    expect(checklistMatch(setup(), ['range tracé'])).toEqual({ checked: 1, total: 2 });
    expect(checklistMatch(setup({ checklist: [] }), ['x'])).toBeNull();
    expect(checklistMatch(null, ['x'])).toBeNull();
  });
});
