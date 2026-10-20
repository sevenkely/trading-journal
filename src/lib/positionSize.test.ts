import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTRACT_SIZE, inferPipSize, positionSize } from './positionSize';

/** Cas de référence : compte 10 000 USD, 1 % de risque, EURUSD, stop à 20 pips. */
const EURUSD = { balance: 10_000, riskPct: 1, entry: 1.1, stop: 1.098, direction: 'long' as const };

describe('positionSize', () => {
  it('calcule la taille qui risque exactement le montant visé', () => {
    const size = positionSize(EURUSD, 0.0001);
    expect(size).not.toBeNull();
    // 1 % de 10 000 = 100 $ risqués ; stop à 0,002 → 50 000 unités = 0,5 lot
    expect(size?.riskAmount).toBe(100);
    expect(size?.stopDistance).toBeCloseTo(0.002, 10);
    expect(size?.stopPips).toBe(20);
    expect(size?.units).toBe(50_000);
    expect(size?.lots).toBe(0.5);
    expect(size?.actualRisk).toBe(100);
    expect(size?.stopOnWrongSide).toBe(false);
  });

  it('arrondit vers le bas au pas de lot : on ne dépasse jamais le risque visé', () => {
    // Stop large (2 % du prix) : le risque visé autoriserait 0,05 lot, pas de pas plus petit ici
    const size = positionSize({ ...EURUSD, stop: 1.078, lotStep: 0.01 });
    expect(size).not.toBeNull();
    // 100 $ / (0,022 × 100 000) = 0,0454… → 0,04 lot, jamais 0,05
    expect(size?.lots).toBe(0.04);
    expect(size?.actualRisk).toBeLessThanOrEqual(size?.riskAmount ?? Infinity);
  });

  it('descend jusqu’à 0 quand le pas minimal est trop grand (risque trop petit)', () => {
    // 10 $ risqués sur un stop à 0,05 : 0,002 lot < pas 0,01
    const size = positionSize({ balance: 1_000, riskPct: 1, entry: 1.1, stop: 1.05, direction: 'long' }, 0.0001);
    expect(size?.lots).toBe(0);
    expect(size?.units).toBe(0);
    expect(size?.actualRisk).toBe(0);
  });

  it('calcule le rendement / risque et le gain potentiel avec un take profit', () => {
    const size = positionSize({ ...EURUSD, takeProfit: 1.106 }, 0.0001);
    // TP à +60 pips sur un stop de 20 pips → R:R 3 et potentiel 300 $
    expect(size?.rr).toBe(3);
    expect(size?.potential).toBe(300);
  });

  it('ignore un take profit qui serait du même prix que l’entrée', () => {
    const size = positionSize({ ...EURUSD, takeProfit: 1.1 });
    expect(size?.rr).toBeNull();
    expect(size?.potential).toBeNull();
  });

  it('détecte un stop côté inverse du sens', () => {
    // Achat avec le stop au-dessus de l'entrée : impossible
    expect(positionSize({ ...EURUSD, stop: 1.102 })?.stopOnWrongSide).toBe(true);
    // Vente avec le stop au-dessus de l'entrée : correct
    expect(
      positionSize({ balance: 10_000, riskPct: 1, entry: 1.1, stop: 1.102, direction: 'short' })?.stopOnWrongSide,
    ).toBe(false);
    // Vente avec le stop sous l'entrée : impossible
    expect(
      positionSize({ balance: 10_000, riskPct: 1, entry: 1.1, stop: 1.098, direction: 'short' })?.stopOnWrongSide,
    ).toBe(true);
  });

  it('accepte un short : la distance se lit en valeur absolue', () => {
    const size = positionSize({ balance: 10_000, riskPct: 1, entry: 1.1, stop: 1.102, direction: 'short' }, 0.0001);
    expect(size?.lots).toBe(0.5);
    expect(size?.stopOnWrongSide).toBe(false);
  });

  it('refuse les saisies qui ne permettent pas de calculer', () => {
    expect(positionSize({ ...EURUSD, balance: 0 })).toBeNull();
    expect(positionSize({ ...EURUSD, balance: Number.NaN })).toBeNull();
    expect(positionSize({ ...EURUSD, riskPct: 0 })).toBeNull();
    expect(positionSize({ ...EURUSD, stop: 1.1 })).toBeNull(); // distance nulle
    expect(positionSize({ ...EURUSD, entry: -1 })).toBeNull();
  });

  it('utilise le contrat par défaut du forex sans réglage', () => {
    const size = positionSize(EURUSD);
    expect(size?.units).toBeLessThanOrEqual(DEFAULT_CONTRACT_SIZE);
  });
});

describe('inferPipSize', () => {
  it('devine les tailles de pip courantes', () => {
    expect(inferPipSize('EURUSD')).toBe(0.0001);
    expect(inferPipSize('usdjpy')).toBe(0.01);
    expect(inferPipSize('XAUUSD')).toBe(0.1);
    expect(inferPipSize('XAGUSD')).toBe(0.01);
    expect(inferPipSize('BTCUSD')).toBeNull();
    expect(inferPipSize('NQ')).toBeNull();
    // Les futures se mesurent en ticks, pas en pips : même une racine courte et ambiguë est refusée.
    expect(inferPipSize('GC')).toBeNull();
    expect(inferPipSize('6E')).toBeNull();
    expect(inferPipSize('')).toBeNull();
  });
});
