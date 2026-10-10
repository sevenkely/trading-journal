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

/** Mois (YYYY-MM) décalé de `delta` mois, sans dépendre du fuseau (calcul en UTC). */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Premier et dernier jour (YYYY-MM-DD) d’un mois YYYY-MM. */
export function monthBounds(monthKey: string): { first: string; last: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { first: `${monthKey}-01`, last: `${monthKey}-${String(daysInMonth).padStart(2, '0')}` };
}

/** Tous les jours (YYYY-MM-DD) d’un mois, dans l’ordre. */
export function monthDays(monthKey: string): string[] {
  const { last } = monthBounds(monthKey);
  const count = Number(last.slice(-2));
  return Array.from({ length: count }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`);
}

/** Numéro de jour (0 = lundi) d’une date YYYY-MM-DD, lu en UTC pour ne pas décaler le jour. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Les `count` derniers mois (YYYY-MM) qui se terminent à `endMonth`, du plus ancien au plus récent.
 * C’est la fenêtre du bilan annuel : douze mois glissants, à cheval sur deux années civiles.
 */
export function lastMonths(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonthKey(endMonth, i + 1 - count));
}

/**
 * Découpe un mois en semaines civiles (lundi → dimanche), tronquées aux bords du mois :
 * le premier et le dernier groupe peuvent être partiels. C’est le découpage du bilan mensuel.
 */
export function monthWeeks(monthKey: string): string[][] {
  const weeks: string[][] = [];
  for (const date of monthDays(monthKey)) {
    if (weeks.length === 0 || weekdayIndex(date) === 0) weeks.push([]);
    weeks[weeks.length - 1].push(date);
  }
  return weeks;
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
