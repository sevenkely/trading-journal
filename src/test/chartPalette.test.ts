// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { chartPalette } from '../components/charts/shared';

/** Luminance relative WCAG d’une couleur #rrggbb. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('palette des graphiques', () => {
  it('suit le thème : sombre par défaut, clair quand data-theme="light"', () => {
    expect(chartPalette().text).toBe('#eef2f8');
    document.documentElement.dataset.theme = 'light';
    expect(chartPalette().text).toBe('#1d2330');
  });

  it('thème clair : libellés et axes à 4,5:1 sur le fond, tracés à 3:1 (WCAG 1.4.3 et 1.4.11)', () => {
    document.documentElement.dataset.theme = 'light';
    const p = chartPalette();
    expect(contrast(p.text, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.axis, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.equity, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrast(p.limit, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrast(p.target, '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it('thème sombre : axes lisibles sur le fond du tracé', () => {
    const p = chartPalette();
    expect(contrast(p.axis, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
