import { dayKey } from './format';
import type { Trade } from './types';
import { round2 } from './utils';

/** Jours de la semaine, lundi en premier (index 0 = lundi). */
export const WEEK_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Ajoute n jours calendaires à une date YYYY-MM-DD. */
export function shiftDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lundi (YYYY-MM-DD) de la semaine courante, ou de la semaine située `weeksAgo` semaines plus tôt. */
export function mondayOf(now: Date, tz: string, weeksAgo = 0): string {
  const { day } = weekdayHour(now.toISOString(), tz); // 0 = lundi
  return shiftDays(dayKey(now, tz), -day - 7 * weeksAgo);
}

/** Les sept dates (YYYY-MM-DD) d’une semaine, de lundi à dimanche. */
export function weekKeys(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDays(monday, i));
}

export interface HeatCell {
  pnl: number;
  count: number;
}

/** Jour de la semaine (0 = lundi) et heure (0 à 23) d'une date, dans le fuseau donné. */
export function weekdayHour(iso: string, tz: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return { day: Math.max(0, WEEK_KEYS.indexOf(weekday as (typeof WEEK_KEYS)[number])), hour: hour % 24 };
}

/** P&L net et nombre de trades par case « jour × heure d’entrée » (clé : `jour-heure`). */
export function weekdayHourGrid(trades: Trade[], tz: string): Map<string, HeatCell> {
  const grid = new Map<string, HeatCell>();
  for (const t of trades) {
    const { day, hour } = weekdayHour(t.opened_at, tz);
    const key = `${day}-${hour}`;
    const cell = grid.get(key) ?? { pnl: 0, count: 0 };
    cell.pnl = round2(cell.pnl + t.net_pnl);
    cell.count += 1;
    grid.set(key, cell);
  }
  return grid;
}
