import { describe, expect, it } from 'vitest';
import {
  FUTURES_CONTRACTS,
  expiryLabel,
  findFuturesContract,
  futuresContract,
  futuresMultiplier,
  futuresPnl,
  futuresPositionSize,
  parseFuturesSymbol,
} from './futures';

const NOW = new Date('2026-01-15T12:00:00Z');

const NQ = futuresContract('NQ')!;
const MNQ = futuresContract('MNQ')!;
const GC = futuresContract('GC')!;
const MGC = futuresContract('MGC')!;
const ES = futuresContract('ES')!;
const CL = futuresContract('CL')!;
const ZN = futuresContract('ZN')!;

describe('registre des contrats', () => {
  it('dérive le multiplicateur du tick sans le stocker', () => {
    expect(futuresMultiplier(NQ)).toBe(20); // 5 $ le tick de 0,25 → 20 $ le point
    expect(futuresMultiplier(ES)).toBe(50);
    expect(futuresMultiplier(MNQ)).toBe(2);
    expect(futuresMultiplier(GC)).toBe(100); // 100 oz
    expect(futuresMultiplier(MGC)).toBe(10);
    expect(futuresMultiplier(CL)).toBe(1_000);
    expect(futuresMultiplier(ZN)).toBe(1_000);
  });

  it('donne à chaque contrat des constantes cohérentes et un micro connu', () => {
    for (const contract of FUTURES_CONTRACTS) {
      expect(contract.tickSize).toBeGreaterThan(0);
      expect(contract.tickValue).toBeGreaterThan(0);
      // Un tick doit valoir exactement tickValue : multiplier × tickSize = tickValue
      // (12,5 / 0,25 = 50 sur l'ES, 31,25 / 0,03125 = 1 000 sur le ZB, 0,5 / 1 = 0,5 sur le MYM)
      expect(Math.abs(futuresMultiplier(contract) * contract.tickSize - contract.tickValue)).toBeLessThan(1e-6);
      if (contract.micro) {
        const micro = futuresContract(contract.micro);
        expect(micro, `${contract.root} → ${contract.micro}`).not.toBeNull();
        // Un micro partage le tick du contrat plein et coûte moins cher
        expect(micro?.tickSize).toBe(contract.tickSize);
        expect(micro?.tickValue).toBeLessThan(contract.tickValue);
      }
    }
  });
});

describe('parseFuturesSymbol', () => {
  it('reconnaît une racine seule', () => {
    const parsed = parseFuturesSymbol('nq', NOW);
    expect(parsed?.contract.root).toBe('NQ');
    expect(parsed?.expiry).toBeNull();
    expect(parsed?.continuous).toBe(true);
  });

  it('lit les échéances des plateformes courantes', () => {
    expect(parseFuturesSymbol('NQH6', NOW)?.expiryLabel).toBe('mars 2026');
    expect(parseFuturesSymbol('NQZ2026', NOW)?.expiryLabel).toBe('décembre 2026');
    expect(parseFuturesSymbol('NQ 03-26', NOW)?.expiryLabel).toBe('mars 2026');
    expect(parseFuturesSymbol('GCZ5', NOW)?.expiry).toBe('Z5');
    expect(parseFuturesSymbol('GCZ5', NOW)?.expiryLabel).toBe('décembre 2025');
    expect(parseFuturesSymbol('es z6', NOW)?.contract.root).toBe('ES');
  });

  it('retient la racine la plus longue : les micros ne deviennent pas des contrats pleins', () => {
    expect(parseFuturesSymbol('MNQH6', NOW)?.contract.root).toBe('MNQ');
    expect(parseFuturesSymbol('MGCZ5', NOW)?.contract.root).toBe('MGC');
    expect(parseFuturesSymbol('MESZ2026', NOW)?.contract.root).toBe('MES');
    expect(parseFuturesSymbol('SILH6', NOW)?.contract.root).toBe('SIL');
    expect(parseFuturesSymbol('M2KZ5', NOW)?.contract.root).toBe('M2K');
  });

  it('reconnaît les symboles continus', () => {
    const tv = parseFuturesSymbol('@NQ1!', NOW);
    expect(tv?.contract.root).toBe('NQ');
    expect(tv?.continuous).toBe(true);
    expect(tv?.expiry).toBeNull();
    expect(parseFuturesSymbol('NQ=F', NOW)?.continuous).toBe(true);
    expect(parseFuturesSymbol('MNQ1!', NOW)?.symbol).toBe('MNQ');
  });

  it('refuse les instruments qui ne sont pas des futures', () => {
    expect(parseFuturesSymbol('', NOW)).toBeNull();
    expect(parseFuturesSymbol('EURUSD', NOW)).toBeNull();
    expect(parseFuturesSymbol('XAUUSD', NOW)).toBeNull();
    expect(parseFuturesSymbol('SILVER', NOW)).toBeNull(); // ne doit pas devenir le contrat SIL
    expect(parseFuturesSymbol('CLOUD', NOW)).toBeNull(); // ni CL
    expect(parseFuturesSymbol('BTCUSD', NOW)).toBeNull(); // ni BTC
    expect(parseFuturesSymbol('AAPL', NOW)).toBeNull();
    expect(findFuturesContract('GC')).toBe(GC);
    expect(findFuturesContract('6E')).not.toBeNull();
  });
});

describe('expiryLabel', () => {
  it('traduit les codes de mois', () => {
    expect(expiryLabel('H6', NOW)).toBe('mars 2026');
    expect(expiryLabel('Z6', NOW)).toBe('décembre 2026');
    expect(expiryLabel('M7', NOW)).toBe('juin 2027');
    expect(expiryLabel('12-26', NOW)).toBe('décembre 2026');
    expect(expiryLabel('03-26', NOW)).toBe('mars 2026');
  });

  it('refuse les codes impossibles', () => {
    expect(expiryLabel('A6', NOW)).toBeNull(); // A n'est pas un code de mois
    expect(expiryLabel('13-26', NOW)).toBeNull();
    expect(expiryLabel('VER', NOW)).toBeNull();
    expect(expiryLabel('', NOW)).toBeNull();
  });
});

describe('futuresPnl', () => {
  it('multiplie les points par la valeur du contrat, dans le bon sens', () => {
    const long = futuresPnl({ contract: NQ, direction: 'long', entry: 20_000, exit: 20_010.25, contracts: 1 });
    expect(long?.points).toBe(10.25);
    expect(long?.ticks).toBe(41);
    expect(long?.multiplier).toBe(20);
    expect(long?.grossPnl).toBe(205);
    expect(long?.notional).toBe(400_000);

    const wrongWay = futuresPnl({ contract: NQ, direction: 'short', entry: 20_000, exit: 20_010.25, contracts: 1 });
    expect(wrongWay?.grossPnl).toBe(-205);

    // 3 micros valent moins qu'un contrat plein
    expect(futuresPnl({ contract: MNQ, direction: 'long', entry: 20_000, exit: 20_010, contracts: 3 })?.grossPnl).toBe(60);
  });

  it('applique les constantes de chaque marché', () => {
    expect(futuresPnl({ contract: ES, direction: 'long', entry: 5_000, exit: 5_010.25, contracts: 1 })?.grossPnl).toBe(512.5);
    expect(futuresPnl({ contract: GC, direction: 'long', entry: 2_350.5, exit: 2_354, contracts: 1 })?.grossPnl).toBe(350);
    expect(futuresPnl({ contract: MGC, direction: 'long', entry: 2_350.5, exit: 2_354, contracts: 2 })?.grossPnl).toBe(70);
    expect(futuresPnl({ contract: CL, direction: 'short', entry: 70, exit: 69.6, contracts: 2 })?.grossPnl).toBe(800);
    // 1 tick de T-Note = 15,625 $
    expect(futuresPnl({ contract: ZN, direction: 'long', entry: 110.5, exit: 110.515625, contracts: 1 })?.grossPnl).toBe(15.63);
    expect(futuresPnl({ contract: ZN, direction: 'long', entry: 110.5, exit: 110.515625, contracts: 1 })?.ticks).toBe(1);
  });

  it('refuse les prix absents et accepte une taille nulle', () => {
    expect(futuresPnl({ contract: NQ, direction: 'long', entry: 0, exit: 20_000, contracts: 1 })).toBeNull();
    expect(futuresPnl({ contract: NQ, direction: 'long', entry: Number.NaN, exit: 20_000, contracts: 1 })).toBeNull();
    expect(futuresPnl({ contract: NQ, direction: 'long', entry: 20_000, exit: 20_100, contracts: 0 })?.grossPnl).toBe(0);
  });
});

describe('futuresPositionSize', () => {
  it('arrondit au contrat entier, jamais au-dessus du risque visé', () => {
    // 10 000 $, 1 % = 100 $ ; stop à 5 points sur NQ = 20 ticks × 5 $ = 100 $ → 1 contrat
    const size = futuresPositionSize({ contract: NQ, balance: 10_000, riskPct: 1, entry: 20_000, stop: 19_995, direction: 'long' });
    expect(size).not.toBeNull();
    expect(size?.stopTicks).toBe(20);
    expect(size?.riskPerContract).toBe(100);
    expect(size?.contracts).toBe(1);
    expect(size?.actualRisk).toBe(100);
    expect(size?.multiplier).toBe(20);
    expect(size?.notional).toBe(400_000);
    expect(size?.micro).toBeNull();
    expect(size?.stopOnWrongSide).toBe(false);
  });

  it('ne dépasse jamais le risque visé quand le stop est irrégulier', () => {
    // Stop à 3,25 points : 13 ticks × 5 $ = 65 $ → 1 contrat pour 100 $ visés
    const size = futuresPositionSize({ contract: NQ, balance: 10_000, riskPct: 1, entry: 20_000, stop: 19_996.75, direction: 'long' });
    expect(size?.stopTicks).toBe(13);
    expect(size?.contracts).toBe(1);
    expect(size?.actualRisk).toBeLessThanOrEqual(size?.riskAmount ?? Infinity);
  });

  it('propose le micro quand le risque visé ne permet pas un contrat plein', () => {
    // 2 000 $, 1 % = 20 $ ; stop à 2 points (8 ticks) : 40 $ le NQ, 4 $ le MNQ → 5 micros
    const size = futuresPositionSize({ contract: NQ, balance: 2_000, riskPct: 1, entry: 20_000, stop: 19_998, direction: 'long' });
    expect(size?.contracts).toBe(0);
    expect(size?.actualRisk).toBe(0);
    expect(size?.micro?.contract.root).toBe('MNQ');
    expect(size?.micro?.contracts).toBe(5);
    expect(size?.micro?.actualRisk).toBe(20);
  });

  it('mesure la distance en ticks du contrat choisi (micro et plein partagent le tick)', () => {
    const wood = futuresPositionSize({ contract: MGC, balance: 5_000, riskPct: 1, entry: 2_350, stop: 2_345, direction: 'long' });
    expect(wood?.stopTicks).toBe(50); // 5 $ / 0,10
    expect(wood?.riskPerContract).toBe(50); // 50 ticks × 1 $
    expect(wood?.contracts).toBe(1); // 50 $ visés
    expect(wood?.micro).toBeNull();
  });

  it('calcule le rendement / risque et le gain potentiel sur la base du contrat', () => {
    const size = futuresPositionSize({
      contract: NQ,
      balance: 10_000,
      riskPct: 1,
      entry: 20_000,
      stop: 19_990,
      direction: 'long',
      takeProfit: 20_030,
    });
    expect(size?.riskPerContract).toBe(200); // 40 ticks × 5 $
    expect(size?.contracts).toBe(0);
    expect(size?.rr).toBe(3);
    expect(size?.potential).toBe(0); // 0 contrat : rien à gagner tant que la taille n'est pas là
  });

  it('détecte un stop côté inverse du sens', () => {
    expect(
      futuresPositionSize({ contract: NQ, balance: 10_000, riskPct: 1, entry: 20_000, stop: 20_010, direction: 'long' })?.stopOnWrongSide,
    ).toBe(true);
    expect(
      futuresPositionSize({ contract: NQ, balance: 10_000, riskPct: 1, entry: 20_000, stop: 19_990, direction: 'short' })?.stopOnWrongSide,
    ).toBe(true);
    expect(
      futuresPositionSize({ contract: NQ, balance: 10_000, riskPct: 1, entry: 20_000, stop: 20_010, direction: 'short' })?.stopOnWrongSide,
    ).toBe(false);
  });

  it('refuse les saisies qui ne permettent pas de calculer', () => {
    const base = { contract: NQ, balance: 10_000, riskPct: 1, entry: 20_000, stop: 19_990, direction: 'long' as const };
    expect(futuresPositionSize({ ...base, balance: 0 })).toBeNull();
    expect(futuresPositionSize({ ...base, balance: Number.NaN })).toBeNull();
    expect(futuresPositionSize({ ...base, riskPct: 0 })).toBeNull();
    expect(futuresPositionSize({ ...base, stop: 20_000 })).toBeNull();
    expect(futuresPositionSize({ ...base, entry: -1 })).toBeNull();
  });
});
