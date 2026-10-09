const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = offsetFormatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetFormatters.set(tz, formatter);
  }
  return formatter;
}

/** Décalage (en ms) de la zone IANA à un instant donné : heure murale − UTC. */
export function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = offsetFormatter(tz).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wallAsUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Convertit une heure « murale » (lue dans le fuseau tz) en instant UTC, ISO 8601.
 * Gère l'heure d'été / d'hiver.
 */
export function zonedTimeToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  tz: string,
): string {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = tzOffsetMs(wallAsUtc, tz);
  let utc = wallAsUtc - firstOffset;
  const secondOffset = tzOffsetMs(utc, tz);
  if (secondOffset !== firstOffset) {
    utc = wallAsUtc - secondOffset;
  }
  return new Date(utc).toISOString();
}
