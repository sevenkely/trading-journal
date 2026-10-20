import { describe, expect, it } from 'vitest';
import {
  describeMedia,
  missingStoryRoles,
  nextRole,
  normalizeMedia,
  storyGroups,
  storyIsComplete,
  verdictInfo,
  verdictLabel,
} from './story';
import type { TradeMedia } from './types';

const media = (path: string, role: TradeMedia['role'], caption: string | null = null): TradeMedia => ({
  path,
  role,
  caption,
});

describe('dossier visuel', () => {
  it('range les images dans l’ordre du récit, et omet les rôles vides', () => {
    const groups = storyGroups([
      media('result.webp', 'result'),
      media('htf.webp', 'htf'),
      media('ltf.webp', 'ltf'),
    ]);
    expect(groups.map((g) => g.role)).toEqual(['htf', 'ltf', 'result']);
    expect(groups[1].items.map((i) => i.path)).toEqual(['ltf.webp']);
  });

  it('garde plusieurs images du même rôle dans l’ordre du tableau', () => {
    const groups = storyGroups([media('a.webp', 'ltf'), media('b.webp', 'ltf')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.path)).toEqual(['a.webp', 'b.webp']);
  });

  it('signale les rôles qui manquent, sans exiger « autre »', () => {
    expect(missingStoryRoles([])).toEqual(['htf', 'ltf', 'result']);
    expect(missingStoryRoles([media('a', 'htf'), media('b', 'other')])).toEqual(['ltf', 'result']);
    expect(storyIsComplete([media('a', 'htf'), media('b', 'ltf'), media('c', 'result')])).toBe(true);
  });

  it('attribue la première place libre à une nouvelle image, puis « autre »', () => {
    expect(nextRole([])).toBe('htf');
    expect(nextRole([media('a', 'htf')])).toBe('ltf');
    expect(nextRole([media('a', 'htf'), media('b', 'ltf')])).toBe('result');
    expect(nextRole([media('a', 'htf'), media('b', 'ltf'), media('c', 'result')])).toBe('other');
  });

  it('résume le dossier en une ligne', () => {
    expect(describeMedia([])).toBe('aucune image');
    expect(describeMedia([media('a', 'htf'), media('b', 'ltf'), media('c', 'ltf')])).toBe('1 HTF · 2 LTF');
  });
});

describe('normalizeMedia', () => {
  it('ignore ce qui n’a pas de chemin et rabat un rôle inconnu sur « autre »', () => {
    expect(
      normalizeMedia([
        { path: 'a.webp', role: 'htf', caption: 'ok' },
        { path: '', role: 'ltf' },
        { role: 'ltf' },
        { path: 'b.webp', role: 'inconnu' },
        'c.webp',
      ]),
    ).toEqual([
      { path: 'a.webp', role: 'htf', caption: 'ok' },
      { path: 'b.webp', role: 'other', caption: null },
      { path: 'c.webp', role: 'other', caption: null },
    ]);
  });

  it('vide les légendes faites d’espaces', () => {
    expect(normalizeMedia([{ path: 'a.webp', role: 'htf', caption: '   ' }])).toEqual([
      { path: 'a.webp', role: 'htf', caption: null },
    ]);
  });

  it('reprend l’ancien tableau plat (mode démo) en attribuant les rôles dans l’ordre', () => {
    expect(normalizeMedia(undefined, ['a.webp', 'b.webp', 'c.webp'])).toEqual([
      { path: 'a.webp', role: 'htf', caption: null },
      { path: 'b.webp', role: 'ltf', caption: null },
      { path: 'c.webp', role: 'result', caption: null },
    ]);
  });

  it('n’écrase pas un dossier déjà typé avec l’ancien tableau', () => {
    expect(normalizeMedia([{ path: 'a.webp', role: 'ltf' }], ['vieux.webp'])).toEqual([
      { path: 'a.webp', role: 'ltf', caption: null },
    ]);
  });
});

describe('verdicts', () => {
  it('traduit le verdict et son sens de lecture', () => {
    expect(verdictLabel('played_out')).toBe('Joué comme prévu');
    expect(verdictInfo('no_plan')?.tone).toBe('bad');
    expect(verdictInfo(null)).toBeNull();
  });
});
