import { describe, expect, it } from 'vitest';
import { tzOffsetMs, zonedTimeToIso } from './timezone';
import { dayKey } from './format';

describe('zonedTimeToIso', () => {
  it('applique l’heure d’hiver à Paris (UTC+1)', () => {
    expect(zonedTimeToIso(2026, 1, 15, 12, 0, 0, 'Europe/Paris')).toBe('2026-01-15T11:00:00.000Z');
  });

  it('applique l’heure d’été à Paris (UTC+2)', () => {
    expect(zonedTimeToIso(2026, 7, 15, 12, 0, 0, 'Europe/Paris')).toBe('2026-07-15T10:00:00.000Z');
  });

  it('passe de l’heure d’été à l’heure d’hiver en octobre', () => {
    // Changement le 25 octobre 2026 à 03:00 (heure locale)
    expect(zonedTimeToIso(2026, 10, 24, 12, 0, 0, 'Europe/Paris')).toBe('2026-10-24T10:00:00.000Z');
    expect(zonedTimeToIso(2026, 10, 26, 12, 0, 0, 'Europe/Paris')).toBe('2026-10-26T11:00:00.000Z');
  });

  it('utilise UTC+3 toute l’année à Antananarivo', () => {
    expect(zonedTimeToIso(2026, 10, 9, 9, 30, 0, 'Indian/Antananarivo')).toBe('2026-10-09T06:30:00.000Z');
    expect(zonedTimeToIso(2026, 1, 9, 9, 30, 0, 'Indian/Antananarivo')).toBe('2026-01-09T06:30:00.000Z');
  });

  it('gère le décalage négatif de New York', () => {
    expect(zonedTimeToIso(2026, 7, 1, 9, 30, 0, 'America/New_York')).toBe('2026-07-01T13:30:00.000Z');
    expect(zonedTimeToIso(2026, 1, 5, 9, 30, 0, 'America/New_York')).toBe('2026-01-05T14:30:00.000Z');
  });
});

describe('tzOffsetMs', () => {
  it('renvoie le décalage de la zone à un instant donné', () => {
    expect(tzOffsetMs(Date.UTC(2026, 6, 1, 12), 'America/New_York')).toBe(-4 * 3_600_000);
    expect(tzOffsetMs(Date.UTC(2026, 6, 1, 12), 'Indian/Antananarivo')).toBe(3 * 3_600_000);
  });
});

describe('dayKey', () => {
  it('découpe la journée dans le fuseau demandé', () => {
    // 22:30 UTC = 01:30 du lendemain à Antananarivo
    expect(dayKey('2026-10-08T22:30:00.000Z', 'UTC')).toBe('2026-10-08');
    expect(dayKey('2026-10-08T22:30:00.000Z', 'Indian/Antananarivo')).toBe('2026-10-09');
  });
});
