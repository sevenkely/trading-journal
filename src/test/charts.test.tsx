// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CalendarHeatmap } from '../components/charts/CalendarHeatmap';
import { DailyPnlChart } from '../components/charts/DailyPnlChart';
import { EquityPanel } from '../components/charts/EquityPanel';
import { HourDayHeatmap } from '../components/charts/HourDayHeatmap';
import { OutcomeBar } from '../components/charts/OutcomeBar';
import { RHistogram } from '../components/charts/RHistogram';
import { dailyBars, hourGrid, outcomeSplit } from '../lib/chartData';
import { dailyMap } from '../lib/metrics';
import type { Trade } from '../lib/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // Recharts observe la taille de ses conteneurs (absent de jsdom)
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => current.unmount());
  }
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

async function render(node: React.ReactElement): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const target = root;
  await act(async () => {
    target.render(node);
  });
  return host;
}

function trade(i: number, closedAt: string, netPnl: number, risk: number | null = 100): Trade {
  return {
    id: `t${i}`,
    account_id: 'a1',
    instrument: 'NQ',
    direction: 'long',
    opened_at: closedAt,
    closed_at: closedAt,
    entry_price: null,
    exit_price: null,
    stop_loss: null,
    take_profit: null,
    size: null,
    risk_amount: risk,
    gross_pnl: netPnl,
    fees: 0,
    net_pnl: netPnl,
    session: null,
    setup: null,
    timeframe: null,
    emotions_before: [],
    emotions_after: [],
    plan_respected: null,
    mistakes: [],
    checklist_done: [],
    notes: null,
    tags: [],
    source: 'manual',
    external_id: null,
    import_batch_id: null,
    screenshots: [],
    created_at: closedAt,
  } as Trade;
}

const sample: Trade[] = [
  trade(1, '2026-03-02T15:00:00Z', 300, 100),
  trade(2, '2026-03-03T15:00:00Z', -500, 250),
  trade(3, '2026-03-04T15:00:00Z', -200, null),
  trade(4, '2026-03-05T15:00:00Z', 400, 200),
];

describe('graphiques', () => {
  it('la carte jour × heure grise les cases sous 10 trades et le dit', async () => {
    const many = Array.from({ length: 10 }, (_, i) => trade(100 + i, '2026-01-15T14:30:00Z', 10, 100));
    const few = [trade(200, '2026-01-16T14:30:00Z', -5, 100)];
    const el = await render(<HourDayHeatmap grid={hourGrid([...many, ...few])} currency="USD" />);
    // Jeudi 9 h (NY) : 10 trades → pas grisé ; vendredi 9 h : 1 trade → grisé
    expect(el.querySelector('[aria-label*="Jeudi 9 h (NY) : 10 trade(s)"]')?.textContent).toBe('10');
    const thin = el.querySelector('[aria-label*="Vendredi 9 h (NY) : 1 trade(s)"]');
    expect(thin?.getAttribute('aria-label')).toContain('échantillon insuffisant');
    expect(el.textContent).toContain('case(s) grisée(s)');
    expect(el.textContent).toContain('Heure d’entrée à New York');
  });

  it('l’histogramme des R annonce la moyenne et la médiane et propose un tableau', async () => {
    const el = await render(<RHistogram values={[-1, -0.5, 0.5, 1, 2]} />);
    const img = el.querySelector('[role="img"]');
    expect(img?.getAttribute('aria-label')).toContain('moyenne');
    expect(img?.getAttribute('aria-label')).toContain('médiane');
    expect(el.querySelector('table')).not.toBeNull();
  });

  it('l’histogramme indique l’absence de R calculable', async () => {
    const el = await render(<RHistogram values={[]} />);
    expect(el.textContent).toContain('le R n’est pas calculable');
  });

  it('le calendrier ouvre les trades d’un jour au clic', async () => {
    const onSelect = vi.fn();
    const el = await render(
      <CalendarHeatmap daily={dailyMap(sample, 'UTC')} initialMonth="2026-03" currency="USD" onSelectDay={onSelect} />,
    );
    expect(el.textContent).toContain('Mars 2026');
    const day = el.querySelector<HTMLButtonElement>('button[aria-label^="Mardi 3 mars"]');
    expect(day).not.toBeNull();
    await act(async () => {
      day?.click();
    });
    expect(onSelect).toHaveBeenCalledWith('2026-03-03');
  });

  it('le calendrier passe au mois suivant', async () => {
    const el = await render(<CalendarHeatmap daily={new Map()} initialMonth="2026-12" currency="USD" />);
    const next = el.querySelector<HTMLButtonElement>('button[aria-label="Mois suivant"]');
    await act(async () => {
      next?.click();
    });
    expect(el.textContent).toContain('Janvier 2027');
  });

  it('la répartition gagnants / perdants annonce les effectifs', async () => {
    const el = await render(<OutcomeBar split={outcomeSplit(sample)} />);
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Gagnants 2');
  });

  it('la courbe d’équité et le P&L par jour se rendent avec leur tableau de données', async () => {
    const equity = await render(<EquityPanel trades={sample} startingBalance={10_000} currency="USD" rule={{ maxLoss: 1_000, target: 800, trailing: false }} />);
    expect(equity.textContent).toContain('Courbe d’équité');
    expect(equity.textContent).toContain('Objectif');
    expect(equity.textContent).toContain('Seuil de drawdown');
    expect(equity.querySelector('table')).not.toBeNull();
    await act(async () => {
      root?.unmount();
    });
    root = null;
    host?.remove();

    const daily = await render(<DailyPnlChart bars={dailyBars(sample, 'UTC')} currency="USD" />);
    expect(daily.textContent).toContain('P&L par jour');
    expect(daily.querySelector('table')).not.toBeNull();
  });

  it('la courbe sans trade explique l’absence de données', async () => {
    const el = await render(<EquityPanel trades={[]} startingBalance={10_000} currency="USD" />);
    expect(el.textContent).toContain('apparaîtra après le premier trade');
  });
});
