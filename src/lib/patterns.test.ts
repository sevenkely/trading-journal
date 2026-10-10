import { describe, expect, it } from 'vitest';
import { makeTrade } from '../test/fixtures';
import { lastMonths, mondayOf, monthBounds, monthDays, monthWeeks, shiftDays, shiftMonthKey, weekKeys, weekdayHour, weekdayHourGrid } from './patterns';

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

describe('mois', () => {
  it('décale un mois, y compris au changement d’année', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-10', -14)).toBe('2025-08');
  });

  it('donne le premier et le dernier jour, février bissextile compris', () => {
    expect(monthBounds('2026-10')).toEqual({ first: '2026-10-01', last: '2026-10-31' });
    expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(monthBounds('2028-02')).toEqual({ first: '2028-02-01', last: '2028-02-29' });
  });

  it('liste tous les jours du mois, dans l’ordre', () => {
    const days = monthDays('2026-04');
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-04-01');
    expect(days.at(-1)).toBe('2026-04-30');
  });

  it('liste les douze derniers mois, à cheval sur deux années civiles', () => {
    const months = lastMonths('2026-10', 12);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-11');
    expect(months.at(-1)).toBe('2026-10');
    // Chaque mois n’apparaît qu’une fois, dans l’ordre
    expect(new Set(months).size).toBe(12);
    expect(months.slice(0, 3)).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('découpe le mois en semaines de lundi à dimanche, tronquées aux bords', () => {
    // 1er octobre 2026 : jeudi → première semaine partielle (1er → 4), puis des semaines pleines
    const weeks = monthWeeks('2026-10');
    expect(weeks[0]).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(weeks[1]).toEqual(monthDays('2026-10').slice(4, 11));
    expect(weeks.at(-1)?.at(-1)).toBe('2026-10-31');
    // Toutes les semaines pleines (sauf les deux bords) commencent un lundi et font sept jours
    for (const week of weeks.slice(1, -1)) {
      expect(week).toHaveLength(7);
      expect(week[0]).toMatch(/-(05|12|19|26)$/);
    }
    expect(weeks.flat()).toEqual(monthDays('2026-10'));
  });

  it('un mois qui commence un lundi n’a pas de première semaine partielle', () => {
    // 1er juin 2026 : lundi
    const weeks = monthWeeks('2026-06');
    expect(weeks[0][0]).toBe('2026-06-01');
    expect(weeks[0]).toHaveLength(7);
    expect(weeks.at(-1)?.at(-1)).toBe('2026-06-30');
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
