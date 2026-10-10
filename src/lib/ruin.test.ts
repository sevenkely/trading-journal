import { describe, expect, it } from 'vitest';
import { monteCarloRuin, type RuinInput } from './ruin';

const base: RuinInput = {
  samples: [1],
  riskPerTrade: 100,
  maxLoss: 500,
  target: 1000,
  horizon: 20,
  simulations: 200,
  seed: 7,
};

describe('monteCarloRuin', () => {
  it('atteint toujours l’objectif avec un R constant gagnant', () => {
    const result = monteCarloRuin(base);
    expect(result).not.toBeNull();
    expect(result!.ruinProbability).toBe(0);
    expect(result!.targetProbability).toBe(1);
    expect(result!.medianTradesToTarget).toBe(10);
  });

  it('finit toujours à la limite avec un R constant perdant', () => {
    const result = monteCarloRuin({ ...base, samples: [-1] });
    expect(result!.ruinProbability).toBe(1);
    expect(result!.targetProbability).toBe(0);
    // 500 de limite pour 100 risqués : la ruine tombe au 5e trade
    expect(result!.bands[5].p50).toBe(-500);
  });

  it('ne conclut rien sans limite ni objectif', () => {
    const result = monteCarloRuin({ ...base, samples: [-1], maxLoss: null, target: null });
    expect(result!.ruinProbability).toBe(0);
    expect(result!.targetProbability).toBe(0);
    expect(result!.unfinishedProbability).toBe(1);
  });

  it('est déterministe à graine égale, et varie si la graine change', () => {
    const a = monteCarloRuin({ ...base, samples: [1, -1, 2, -0.5], simulations: 500 });
    const b = monteCarloRuin({ ...base, samples: [1, -1, 2, -0.5], simulations: 500 });
    const c = monteCarloRuin({ ...base, samples: [1, -1, 2, -0.5], simulations: 500, seed: 99 });
    expect(a!.ruinProbability).toBe(b!.ruinProbability);
    expect(a!.bands.at(-1)!.p50).toBe(b!.bands.at(-1)!.p50);
    expect(c!.bands.at(-1)!.p50).not.toBe(a!.bands.at(-1)!.p50);
  });

  it('produit des couloirs ordonnés, un point de départ et un par trade', () => {
    const result = monteCarloRuin(base);
    const bands = result!.bands;
    expect(bands).toHaveLength(base.horizon + 1);
    expect(bands[0].p50).toBe(0);
    for (const band of bands) {
      expect(band.p5).toBeLessThanOrEqual(band.p25);
      expect(band.p25).toBeLessThanOrEqual(band.p50);
      expect(band.p50).toBeLessThanOrEqual(band.p75);
      expect(band.p75).toBeLessThanOrEqual(band.p95);
    }
  });

  it('suit le plus haut d’équité quand le drawdown est trailing', () => {
    // Deux R gagnants puis une perte : en trailing, le seuil remonte de 200
    const samples = [1, 1, -1, -1, -1, -1, -1, -1, -1, -1];
    const statique = monteCarloRuin({ ...base, samples, target: null, horizon: samples.length });
    const trailing = monteCarloRuin({ ...base, samples, target: null, horizon: samples.length, trailing: true });
    expect(trailing!.ruinProbability).toBeGreaterThanOrEqual(statique!.ruinProbability);
  });

  it('refuse une entrée inexploitable', () => {
    expect(monteCarloRuin({ ...base, samples: [] })).toBeNull();
    expect(monteCarloRuin({ ...base, riskPerTrade: 0 })).toBeNull();
  });
});
