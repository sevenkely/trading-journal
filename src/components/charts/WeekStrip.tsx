import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mondayOf, shiftDays } from '../../lib/patterns';
import type { DayCell } from '../../lib/metrics';
import { capFirst, formatDate, formatMoney, formatSignedCompact } from '../../lib/format';
import { usePalette } from '../PaletteContext';
import { ChartFrame } from './ChartFrame';
import { LOSS_HATCH, chartPalette } from './shared';

const WEEKS = 6;
const DAYS = WEEKS * 7;
const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/**
 * Six dernières semaines, un carré par jour de trading. C'est un rythme, pas un calendrier :
 * il répond à « est-ce que j'enchaîne les journées vertes ? », là où le calendrier du Journal
 * sert à ouvrir une journée et écrire ses notes.
 */
export function WeekStrip({
  daily,
  tz,
  currency,
  now = new Date(),
}: {
  daily: Map<string, DayCell>;
  tz: string;
  currency: string;
  now?: Date;
}) {
  const { gainRgb, lossRgb } = usePalette();
  const navigate = useNavigate();

  // Grille alignée sur les semaines : de lundi (il y a 5 semaines) à aujourd'hui compris. La date de
  // référence est figée au montage : la bande ne se décale pas sous les yeux pendant la session.
  const [anchor] = useState(now);
  const days = useMemo(() => {
    const start = mondayOf(anchor, tz, WEEKS - 1);
    return Array.from({ length: DAYS }, (_, i) => shiftDays(start, i));
  }, [anchor, tz]);

  const cells = days.map((date) => ({ date, cell: daily.get(date) }));
  const traded = cells.filter((c) => c.cell !== undefined);
  const maxAbs = Math.max(1, ...traded.map((c) => Math.abs(c.cell?.pnl ?? 0)));
  const total = traded.reduce((sum, c) => sum + (c.cell?.pnl ?? 0), 0);
  const green = traded.filter((c) => (c.cell?.pnl ?? 0) > 0).length;
  const red = traded.filter((c) => (c.cell?.pnl ?? 0) < 0).length;

  const paint = (cell: DayCell | undefined): CSSProperties => {
    if (!cell) return { backgroundColor: 'rgb(125 136 153 / 0.12)' };
    if (cell.pnl === 0) return { backgroundColor: 'rgb(125 136 153 / 0.35)' };
    const alpha = (0.22 + 0.7 * (Math.abs(cell.pnl) / maxAbs)).toFixed(2);
    if (cell.pnl > 0) return { backgroundColor: `rgb(${gainRgb} / ${alpha})` };
    return { backgroundColor: `rgb(${lossRgb} / ${alpha})`, backgroundImage: LOSS_HATCH };
  };

  return (
    <ChartFrame
      title="Rythme des six dernières semaines"
      description={`${traded.length} jour(s) de trading · ${green} vert(s) · ${red} rouge(s) · ${formatMoney(total, currency, true)} au total.`}
      actions={
        <Link to="/journal" className="text-xs font-medium text-accent transition-colors hover:text-accent-hi">
          Ouvrir le journal →
        </Link>
      }
    >
      {traded.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-2 px-4 py-6 text-center text-sm text-muted">
          Aucun jour de trading sur les six dernières semaines.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5" aria-hidden>
            {WEEKDAY_INITIALS.map((initial, i) => (
              <div key={`${initial}-${i}`} className="pb-0.5 text-center text-[10px] text-muted">
                {initial}
              </div>
            ))}
          </div>
          <div
            role="list"
            aria-label={`P&L par jour des six dernières semaines : ${traded.length} jour(s) de trading, ${formatMoney(total, currency, true)} au total`}
            className="grid grid-cols-7 gap-1.5"
          >
            {cells.map(({ date, cell }) => {
              // La clé est déjà un jour calendaire : on le nomme en UTC pour que l’étiquette ne
              // glisse pas d’un jour selon le fuseau du navigateur.
              const label = capFirst(
                formatDate(`${date}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
              );
              if (!cell) {
                return (
                  <div
                    key={date}
                    role="listitem"
                    aria-label={`${label} : aucun trade`}
                    className="aspect-square rounded-md border border-line/60"
                    style={paint(undefined)}
                  />
                );
              }
              return (
                <button
                  key={date}
                  type="button"
                  role="listitem"
                  onClick={() => navigate(`/trades?from=${date}&to=${date}`)}
                  aria-label={`${label} : ${cell.count} trade(s), ${formatMoney(cell.pnl, currency, true)}. Ouvrir les trades de ce jour`}
                  title={`${label} · ${formatSignedCompact(cell.pnl)}`}
                  className="aspect-square rounded-md transition-transform duration-150 hover:scale-[1.08]"
                  style={paint(cell)}
                />
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] tabular-nums text-muted">
            <span>{formatDate(`${days[0]}T12:00:00Z`, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgb(${lossRgb} / 0.8)`, backgroundImage: LOSS_HATCH }} aria-hidden />
                perte
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgb(${gainRgb} / 0.8)` }} aria-hidden />
                gain
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-md border border-line-2" style={{ background: chartPalette().grid }} aria-hidden />
                aucun trade
              </span>
            </span>
            <span>{formatDate(`${days[DAYS - 1]}T12:00:00Z`, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
          </div>
        </>
      )}
    </ChartFrame>
  );
}
