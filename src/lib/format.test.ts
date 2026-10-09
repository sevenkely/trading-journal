import { describe, expect, it } from 'vitest';
import { formatSignedCompact, pnlGlyph, signClass } from './format';

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
