// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axe from 'axe-core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { PaletteProvider } from '../components/PaletteContext';
import { ToastProvider } from '../components/Toast';
import { createLocalRepo } from '../lib/localRepo';
import { accountInput, tradeInput } from './fixtures';

// Audit d'accessibilité automatisé (axe-core) des pages principales, en mode démo.
// Périmètre : critères WCAG 2.x et 2.2, niveaux A et AA. Le contraste des couleurs n'est pas
// audité ici : jsdom ne calcule pas la mise en page. Il a été vérifié à part, sur les jetons du thème.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

beforeAll(() => {
  // Recharts observe la taille des graphiques avec ResizeObserver (absent de jsdom)
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => current.unmount());
  }
  container?.remove();
  root = null;
  container = null;
  localStorage.clear();
});

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

async function waitForText(host: HTMLElement, text: string) {
  const started = Date.now();
  while (!host.textContent?.includes(text) && Date.now() - started < 15_000) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

async function mountAt(path: string, expected: string): Promise<HTMLDivElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  container = host;
  const mountRoot = createRoot(host);
  root = mountRoot;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    mountRoot.render(
      <QueryClientProvider client={queryClient}>
        <PaletteProvider>
          <AuthProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={[path]}>
                <App />
              </MemoryRouter>
            </ToastProvider>
          </AuthProvider>
        </PaletteProvider>
      </QueryClientProvider>,
    );
  });
  await settle();
  await waitForText(host, expected);
  await settle();
  return host;
}

/**
 * Jeu de données de démo : un compte, deux trades clôturés (même jeu que le test de fumée).
 * `withOpen` ajoute une position ouverte, dont le P&L est flottant.
 */
async function seed(withOpen = false) {
  const repo = createLocalRepo();
  const account = await repo.createAccount(
    accountInput({
      name: 'FTMO Test',
      firm: 'FTMO',
      kind: 'evaluation',
      max_loss_pct: 10,
      daily_loss_pct: 5,
      profit_target_pct: 10,
      min_trading_days: 2,
      consistency_pct: 50,
    }),
  );
  await repo.insertTrades([
    tradeInput({
      account_id: account.id,
      instrument: 'EURUSD',
      gross_pnl: 300,
      fees: 4,
      opened_at: '2026-10-05T08:00:00.000Z',
      closed_at: '2026-10-05T09:00:00.000Z',
      risk_amount: 100,
      plan_respected: true,
      session: 'Londres',
      setup: 'Cassure',
      emotions_before: ['Calme'],
    }),
    tradeInput({
      account_id: account.id,
      instrument: 'NQ',
      direction: 'short',
      gross_pnl: -150,
      fees: 2,
      opened_at: '2026-10-06T14:00:00.000Z',
      closed_at: '2026-10-06T15:00:00.000Z',
      plan_respected: false,
      emotions_before: ['Doute'],
      mistakes: ['Stop déplacé'],
    }),
    ...(withOpen
      ? [
          tradeInput({
            account_id: account.id,
            instrument: 'GBPUSD',
            gross_pnl: -250,
            opened_at: '2026-10-09T12:00:00.000Z',
            closed_at: null,
            risk_amount: 200,
          }),
        ]
      : []),
  ]);
}

/** Violations WCAG A/AA, sous forme lisible : identifiant, gravité, nombre d’éléments. */
async function auditViolations(host: HTMLElement): Promise<string[]> {
  const results = await axe.run(host, {
    runOnly: { type: 'tag', values: WCAG_TAGS },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((v) => `${v.id} (${v.impact ?? 'sans gravité'}) : ${v.nodes.length} élément(s)`);
}

describe('accessibilité : axe-core, WCAG 2.2 niveaux A et AA', () => {
  it('aucune violation avec la recherche rapide (⌘K) ouverte', async () => {
    await seed();
    const host = await mountAt('/', 'Derniers trades');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    await waitForText(host, 'Trades récents');
    await settle();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    const violations = await auditViolations(host);
    expect(violations).toEqual([]);
  }, 60_000);

  it.each([
    ['/', 'Derniers trades'],
    ['/comptes', 'Nouveau compte'],
    ['/trades', 'Exporter'],
    ['/journal', 'Notes du jour'],
    ['/analyse', 'Répartition'],
    ['/bilan', 'Jour par jour'],
    ['/bilan?periode=mois', 'Semaine par semaine'],
    ['/bilan?periode=12m', 'Mois par mois'],
    ['/parametres', 'Couleurs des gains et des pertes'],
  ])('aucune violation sur %s', async (path, expected) => {
    await seed();
    const host = await mountAt(path, expected);
    const violations = await auditViolations(host);
    expect(violations).toEqual([]);
  }, 60_000);

  it('aucune violation avec une position ouverte (P&L flottant) sur le tableau de bord', async () => {
    await seed(true);
    const host = await mountAt('/', 'Positions ouvertes');
    expect(host.textContent).toContain('P&L flottant');
    expect(await auditViolations(host)).toEqual([]);
  }, 60_000);

  it('aucune violation sur la saisie d’un nouveau trade, captures comprises', async () => {
    await seed();
    const host = await mountAt('/trades/nouveau', 'Le dossier visuel');
    expect(await auditViolations(host)).toEqual([]);
  }, 60_000);

  it('aucune violation avec le tiroir de détail ouvert depuis la liste des trades', async () => {
    await seed();
    const host = await mountAt('/trades', 'EURUSD');
    const row = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'EURUSD');
    expect(row).toBeDefined();
    await act(async () => {
      row?.click();
    });
    await settle();
    // Le tiroir est rendu dans <body> (portail) : on audite le dialogue lui-même
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(await auditViolations(dialog ?? host)).toEqual([]);
  }, 60_000);

  it('aucune violation avec la bottom sheet « Ajout rapide » ouverte', async () => {
    await seed();
    const host = await mountAt('/trades', 'EURUSD');
    const trigger = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Ajout rapide');
    expect(trigger).toBeDefined();
    await act(async () => {
      trigger?.click();
    });
    await settle();
    // La feuille est rendue dans <body> (portail) : on audite le dialogue lui-même
    const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    expect(dialog).not.toBeNull();
    expect(await auditViolations(dialog ?? host)).toEqual([]);
  }, 60_000);
});
