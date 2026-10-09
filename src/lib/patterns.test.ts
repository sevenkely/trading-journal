import { describe, expect, it } from 'vitest';
import { makeTrade } from '../test/fixtures';
import { mondayOf, shiftDays, weekKeys, weekdayHour, weekdayHourGrid } from './patterns';

describe('semaines', () => {
  it('décale une date de n jours, y compris à travers un mois', () => {
    expect(shiftDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDays('2026-10-05', 6)).toBe('2026-10-11');
  });

  it('trouve le lundi de la semaine courante et des semaines précédentes', () => {
    const friday = new Date('2026-10-09T12:00:00.000Z');
    expect(mondayOf(friday, 'UTC')).toBe('2026-10-05');
    expect(mondayOf(friday, 'UTC', 1)).toBe('2026-09-28');
    // Dimanche 22 h UTC = lundi 01 h à Tananarive : la semaine ne se découpe pas pareil selon le fuseau
    const sundayNight = new Date('2026-10-04T22:00:00.000Z');
    expect(mondayOf(sundayNight, 'Indian/Antananarivo')).toBe('2026-10-05');
    expect(mondayOf(sundayNight, 'UTC')).toBe('2026-09-28');
  });

  it('liste les sept jours de lundi à dimanche', () => {
    const keys = weekKeys('2026-10-05');
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-10-05');
    expect(keys[6]).toBe('2026-10-11');
  });
});

describe('weekdayHour', () => {
  it('donne le jour et l’heure dans le fuseau du compte (Antananarivo = UTC+3)', () => {
    // Lundi 5 octobre 2026, 08:00 UTC = 11:00 à Antananarivo
    expect(weekdayHour('2026-10-05T08:00:00.000Z', 'Indian/Antananarivo')).toEqual({ day: 0, hour: 11 });
  });

  it('bascule au jour suivant quand le fuseau le fait passer minuit', () => {
    // Lundi 23:30 UTC = mardi 02:30 à Antananarivo
    expect(weekdayHour('2026-10-05T23:30:00.000Z', 'Indian/Antananarivo')).toEqual({ day: 1, hour: 2 });
  });

  it('range le dimanche en dernier (index 6)', () => {
    expect(weekdayHour('2026-10-04T23:30:00.000Z', 'UTC')).toEqual({ day: 6, hour: 23 });
  });
});

describe('weekdayHourGrid', () => {
  it('additionne le P&L et compte les trades par case jour × heure d’entrée', () => {
    const trades = [
      makeTrade({ id: 'a', net_pnl: 120, opened_at: '2026-10-05T08:00:00.000Z', closed_at: '2026-10-05T08:40:00.000Z' }),
      makeTrade({ id: 'b', net_pnl: -40.5, opened_at: '2026-10-05T08:30:00.000Z', closed_at: '2026-10-05T09:10:00.000Z' }),
      makeTrade({ id: 'c', net_pnl: 10, opened_at: '2026-10-06T10:00:00.000Z', closed_at: '2026-10-06T10:20:00.000Z' }),
    ];
    const grid = weekdayHourGrid(trades, 'Indian/Antananarivo');
    // Lundi 11 h (heure de Tananarive) : deux trades
    expect(grid.get('0-11')).toEqual({ pnl: 79.5, count: 2 });
    // Mardi 13 h
    expect(grid.get('1-13')).toEqual({ pnl: 10, count: 1 });
    expect(grid.size).toBe(2);
  });
});
