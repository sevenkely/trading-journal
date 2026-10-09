import { describe, expect, it } from 'vitest';
import { formatDuration, formatSignedCompact, pnlGlyph, signClass } from './format';

describe('pnlGlyph', () => {
  it('▲ pour un gain, ▼ pour une perte, rien pour zéro ou une valeur absente', () => {
    expect(pnlGlyph(12.5)).toBe('▲');
    expect(pnlGlyph(-0.01)).toBe('▼');
    expect(pnlGlyph(0)).toBe('');
    expect(pnlGlyph(null)).toBe('');
    expect(pnlGlyph(Number.NaN)).toBe('');
  });
});

describe('signClass', () => {
  it('utilise les jetons de couleur de l’app, pas les couleurs par défaut de Tailwind', () => {
    expect(signClass(5)).toBe('text-gain');
    expect(signClass(-5)).toBe('text-loss');
    expect(signClass(0)).toBe('text-fg-2');
    expect(signClass(undefined)).toBe('text-fg-2');
  });
});

describe('formatSignedCompact', () => {
  it('arrondit sans décimales et écrit le signe', () => {
    expect(formatSignedCompact(1671.38).replace(/\s/g, ' ')).toBe('+1 671');
    expect(formatSignedCompact(-341.64).replace(/\s/g, ' ')).toBe('-342');
    expect(formatSignedCompact(0)).toBe('0');
  });
});

describe('formatDuration', () => {
  const MIN = 60_000;

  it('affiche les durées courtes en minutes', () => {
    expect(formatDuration(0)).toBe('< 1 min');
    expect(formatDuration(45 * MIN)).toBe('45 min');
  });

  it('affiche les heures, avec les minutes restantes', () => {
    expect(formatDuration(72 * MIN)).toBe('1 h 12 min');
    expect(formatDuration(120 * MIN)).toBe('2 h');
  });

  it('affiche les jours au-delà de 24 heures', () => {
    expect(formatDuration(26 * 60 * MIN)).toBe('1 j 2 h');
  });

  it('affiche un tiret sans durée valide', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
  });
});
