import { describe, expect, it } from 'vitest';
import { cumulative, rollingMean, rollingProfitFactor, rollingShare, statSparks } from './spark';

describe('cumulative', () => {
  it('part de zéro et finit sur le total', () => {
    expect(cumulative([10, -4, 2])).toEqual([0, 10, 6, 8]);
  });

  it('traite une valeur non finie comme zéro', () => {
    expect(cumulative([5, Number.NaN, Number.POSITIVE_INFINITY])).toEqual([0, 5, 5, 5]);
  });

  it('renvoie le seul point de départ pour une liste vide', () => {
    expect(cumulative([])).toEqual([0]);
  });
});

describe('rollingMean', () => {
  it('tronque la fenêtre au début de la série', () => {
    expect(rollingMean([2, 4, 6], 2)).toEqual([2, 3, 5]);
  });

  it('garde la même longueur que l’entrée', () => {
    expect(rollingMean([1, 2, 3, 4, 5], 3)).toHaveLength(5);
  });

  it('borne une fenêtre absurde', () => {
    expect(rollingMean([1, 3], 0)).toEqual([1, 3]);
    expect(rollingMean([1, 3], 99)).toEqual([1, 2]);
  });
});

describe('rollingShare', () => {
  it('donne le pourcentage de vraies dans la fenêtre', () => {
    expect(rollingShare([true, false, true, true], 2)).toEqual([100, 50, 50, 100]);
  });

  it('reste vide sans trade', () => {
    expect(rollingShare([], 20)).toEqual([]);
  });
});

describe('rollingProfitFactor', () => {
  it('vaut Infinity tant qu’aucune perte n’est dans la fenêtre', () => {
    const series = rollingProfitFactor([10, 20, -5], 3);
    expect(series[0]).toBe(Infinity);
    expect(series[1]).toBe(Infinity);
    expect(series[2]).toBeCloseTo(6, 5); // 30 ÷ 5
  });

  it('oublie les valeurs sorties de la fenêtre', () => {
    const series = rollingProfitFactor([100, -10, -10], 2);
    expect(series[1]).toBeCloseTo(10, 5); // 100 ÷ 10
    expect(series[2]).toBe(0); // fenêtre [-10, -10] : plus aucun gain, deux pertes
  });
});

describe('statSparks', () => {
  it('aligne les quatre séries sur les trades', () => {
    const sparks = statSparks([100, -50, 20], [2, -1, null], 20);
    expect(sparks.pnl).toEqual([0, 100, 50, 70]);
    expect(sparks.winRate[0]).toBe(100);
    expect(sparks.winRate[1]).toBe(50);
    expect(sparks.winRate[2]).toBeCloseTo(200 / 3, 6);
    expect(sparks.profitFactor[2]).toBeCloseTo(2.4, 5); // 120 ÷ 50
    expect(sparks.avgR).toEqual([2, 0.5]); // le trade sans risque est exclu
  });
});
