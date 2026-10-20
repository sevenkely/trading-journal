// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DailyPnlChart } from '../components/charts/DailyPnlChart';
import { EquityPanel } from '../components/charts/EquityPanel';
import { HourDayHeatmap } from '../components/charts/HourDayHeatmap';
import { OutcomeBar } from '../components/charts/OutcomeBar';
import { RHistogram } from '../components/charts/RHistogram';
import { DisciplineChart, type DisciplineGroup } from '../components/charts/DisciplineChart';
import { WeekdayPnlChart } from '../components/charts/WeekdayPnlChart';
import { WeekStrip } from '../components/charts/WeekStrip';
import { dailyBars, hourGrid, outcomeSplit } from '../lib/chartData';
import { dailyMap, type BreakdownRow } from '../lib/metrics';
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
    media: [],
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

  it('la bande de rythme couvre six semaines pleines et nomme chaque jour de trading', async () => {
    // Mardi 10 mars 2026 : la bande part du lundi 2 février et va jusqu’au 15 mars
    const el = await render(
      <MemoryRouter>
        <WeekStrip daily={dailyMap(sample, 'UTC')} tz="UTC" currency="USD" now={new Date('2026-03-10T12:00:00Z')} />
      </MemoryRouter>,
    );
    expect(el.querySelectorAll('[role="listitem"]')).toHaveLength(42);
    const day = el.querySelector('[aria-label^="Mardi 3 mars"]');
    expect(day?.getAttribute('aria-label')).toContain('1 trade(s)');
    expect(day?.getAttribute('aria-label')).toContain('500');
    // Les jours sans trade restent des cases, annoncées comme telles
    expect(el.querySelector('[aria-label="Vendredi 6 mars : aucun trade"]')).not.toBeNull();
    expect(el.textContent).toContain('4 jour(s) de trading · 2 vert(s) · 2 rouge(s)');
  });

  it('la bande de rythme explique l’absence de six semaines de trading', async () => {
    const el = await render(
      <MemoryRouter>
        <WeekStrip daily={new Map()} tz="UTC" currency="USD" now={new Date('2026-03-10T12:00:00Z')} />
      </MemoryRouter>,
    );
    expect(el.textContent).toContain('Aucun jour de trading sur les six dernières semaines');
    expect(el.querySelectorAll('[role="listitem"]')).toHaveLength(0);
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

  it('le P&L par jour de la semaine nomme le meilleur et le pire jour', async () => {
    const rows: BreakdownRow[] = [
      { key: 'lundi', count: 2, netPnl: 300, winRate: 100, avgPnl: 150 },
      { key: 'mardi', count: 1, netPnl: -200, winRate: 0, avgPnl: -200 },
      { key: 'mercredi', count: 0, netPnl: 0, winRate: 0, avgPnl: 0 },
      { key: 'jeudi', count: 1, netPnl: 50, winRate: 100, avgPnl: 50 },
      { key: 'vendredi', count: 0, netPnl: 0, winRate: 0, avgPnl: 0 },
    ];
    const el = await render(<WeekdayPnlChart rows={rows} currency="USD" />);
    const label = el.querySelector('[role="img"]')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('lundi');
    expect(label).toContain('300');
    expect(el.textContent).toContain('Meilleur : lundi');
    expect(el.textContent).toContain('pire : mardi');
    expect(el.querySelector('table')).not.toBeNull();
  });

  it('le P&L par jour de la semaine explique l’absence de trades', async () => {
    const empty: BreakdownRow[] = [{ key: 'lundi', count: 0, netPnl: 0, winRate: 0, avgPnl: 0 }];
    const el = await render(<WeekdayPnlChart rows={empty} currency="USD" />);
    expect(el.textContent).toContain('Aucun trade sur cette période');
  });

  it('le coût de la discipline compare les groupes et chiffre l’écart', async () => {
    const groups: DisciplineGroup[] = [
      { label: 'Plan suivi', full: 'Plan respecté', value: 100, count: 8 },
      { label: 'Plan non suivi', full: 'Plan non respecté', value: -250, count: 3 },
      { label: 'Avec erreur', full: 'Erreur commise', value: 0, count: 0 },
      { label: 'Sans erreur', full: 'Sans erreur', value: 60, count: 11 },
    ];
    const el = await render(<DisciplineChart groups={groups} currency="USD" />);
    expect(el.textContent).toContain('Plan respecté');
    expect(el.textContent).toContain('Plan non respecté');
    expect(el.textContent).toContain('350');
    // Le groupe vide ne produit ni barre ni ligne de tableau
    expect(el.querySelectorAll('table tbody tr')).toHaveLength(3);
  });

  it('le coût de la discipline explique l’absence de données', async () => {
    const el = await render(
      <DisciplineChart groups={[{ label: 'Plan suivi', full: 'Plan respecté', value: null, count: 0 }]} currency="USD" />,
    );
    expect(el.textContent).toContain('Aucun trade renseigné');
  });
});
