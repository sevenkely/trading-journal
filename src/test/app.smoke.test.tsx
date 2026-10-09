// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { ToastProvider } from '../components/Toast';
import { PaletteProvider } from '../components/PaletteContext';
import { createLocalRepo } from '../lib/localRepo';
import { accountInput, tradeInput } from './fixtures';

// Test de fumée : rend l'application complète en mode démo (sans Supabase).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

/** Attend l'affichage d'un texte : les pages sont chargées à la demande (lazy loading). */
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
  return host;
}

/** Jeu de données : un compte challenge avec règles et deux trades. */
async function seed() {
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
  ]);
  return account;
}

function fieldByLabel(el: HTMLElement, labelStart: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const label = [...el.querySelectorAll('label')].find((l) =>
    (l.querySelector('span')?.textContent ?? '').trim().startsWith(labelStart),
  );
  const field = label?.querySelector('input, select, textarea') as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | null
    | undefined;
  if (!field) throw new Error(`Champ introuvable : ${labelStart}`);
  return field;
}

async function setField(el: HTMLElement, labelStart: string, value: string) {
  const field = fieldByLabel(el, labelStart);
  const proto =
    field instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('Setter de valeur indisponible');
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

async function clickButton(el: HTMLElement, text: string) {
  const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!button) throw new Error(`Bouton introuvable : ${text}`);
  await act(async () => {
    button.click();
  });
  await settle();
}

describe('application en mode démo', () => {
  beforeEach(() => localStorage.clear());

  it('invite à créer un compte quand il n’y a aucune donnée', async () => {
    const el = await mountAt('/', 'Commence par créer un compte');
    expect(el.textContent).toContain('Mode démo');
  });

  it('affiche le tableau de bord avec statistiques, règles et derniers trades', async () => {
    await seed();
    const el = await mountAt('/', 'Derniers trades');
    expect(el.textContent).toContain('P&L net');
    expect(el.textContent).toContain('Taux de réussite');
    expect(el.textContent).toContain('Courbe d’équité');
    expect(el.textContent).toContain('FTMO Test');
    expect(el.textContent).toContain('Meilleur trade');
    expect(el.textContent).toContain('Drawdown max');
    expect(el.textContent).toContain('Règle de cohérence dépassée');
  });

  it.each([
    ['/comptes', 'Nouveau compte'],
    ['/comptes/nouveau', 'Règles de la prop firm'],
    ['/trades', 'Exporter'],
    ['/trades/nouveau', 'Résultat & risque'],
    ['/journal', 'Notes du jour'],
    ['/analyse', 'Discipline'],
    ['/bilan', 'Bilan de la semaine'],
    ['/import', 'Import de trades'],
    ['/parametres', 'Checklist pré-trade'],
  ])('rend la page %s sans erreur', async (path, expected) => {
    await seed();
    const el = await mountAt(path, expected);
    expect(el.textContent).toContain(expected);
  });

  it('ouvre le détail d’un trade existant', async () => {
    await seed();
    const [trade] = await createLocalRepo().listTrades();
    const el = await mountAt(`/trades/${trade.id}`, 'Discipline & psychologie');
    expect(el.textContent).toContain('Captures d’écran');
  });

  it('enregistre un nouveau trade depuis le formulaire', async () => {
    await seed();
    const el = await mountAt('/trades/nouveau', 'Résultat & risque');
    await setField(el, 'Instrument', 'xauusd');
    await setField(el, 'P&L brut', '150');
    await setField(el, 'Frais', '5');
    await clickButton(el, 'Ajouter le trade');

    const created = (await createLocalRepo().listTrades()).find((t) => t.instrument === 'XAUUSD');
    expect(created).toBeDefined();
    expect(created?.net_pnl).toBe(145);
    expect(created?.source).toBe('manual');
  });

  it('refuse un trade sans P&L et affiche le motif', async () => {
    await seed();
    const el = await mountAt('/trades/nouveau', 'Résultat & risque');
    await setField(el, 'Instrument', 'DAX');
    await clickButton(el, 'Ajouter le trade');
    expect(el.textContent).toContain('Le P&L brut est obligatoire');
    expect((await createLocalRepo().listTrades()).some((t) => t.instrument === 'DAX')).toBe(false);
  });

  it('affiche une répartition à la fois et change de dimension depuis les onglets', async () => {
    await seed();
    const el = await mountAt('/analyse', 'Répartition');
    expect(el.textContent).toContain('Résultats par session');
    expect(el.textContent).toContain('Meilleur');
    const instrumentTab = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Instrument');
    expect(instrumentTab).toBeDefined();
    await act(async () => {
      instrumentTab?.click();
    });
    await settle();
    expect(el.textContent).toContain('EURUSD');
    expect(instrumentTab?.getAttribute('aria-pressed')).toBe('true');
  });

  it('affiche le détail d’une case de la carte jour × heure au clic', async () => {
    await seed();
    const el = await mountAt('/analyse', 'Jour × heure d’entrée');
    const cell = el.querySelector<HTMLButtonElement>('button[aria-pressed]');
    expect(cell).not.toBeNull();
    await act(async () => {
      cell?.click();
    });
    await settle();
    expect(cell?.getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).toContain('trade(s)');
  });

  it('enregistre la palette daltonienne et l’applique à la page', async () => {
    await seed();
    const el = await mountAt('/parametres', 'Couleurs des gains et des pertes');
    const option = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Bleu / orange');
    expect(option).toBeDefined();
    await act(async () => {
      option?.click();
    });
    await settle();
    expect(document.documentElement.dataset.palette).toBe('daltonien');
    expect(localStorage.getItem('tj-palette')).toBe('daltonien');
    delete document.documentElement.dataset.palette;
  });

  it('affiche la régularité, les comportements et la carte jour × heure dans l’analyse', async () => {
    await seed();
    const el = await mountAt('/analyse', 'Jour × heure d’entrée');
    expect(el.textContent).toContain('Plus de détails');
    expect(el.textContent).toContain('Série de gains');
    expect(el.textContent).toContain('Série de gains');
    expect(el.textContent).toContain('Comportements');
  });

  it('affiche le bilan hebdomadaire avec les jours, les signaux et la prévision', async () => {
    await seed();
    const el = await mountAt('/bilan', 'Jour par jour');
    expect(el.textContent).toContain('Signaux de comportement');
    expect(el.textContent).toContain('Objectifs & prévision');
    expect(el.textContent).toContain('Imprimer / PDF');
  });

  it('ouvre la recherche rapide avec Ctrl+K et propose pages et trades récents', async () => {
    await seed();
    const el = await mountAt('/', 'Derniers trades');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    await waitForText(el, 'Trades récents');
    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Recherche rapide');
    expect(el.textContent).toContain('Nouveau compte');
    expect(el.textContent).toContain('Bilan de la semaine');
    // Une seconde frappe referme la palette
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    // La sortie est animée : on attend que le dialogue disparaisse (borné)
    const started = Date.now();
    while (el.querySelector('[role="dialog"]') && Date.now() - started < 5_000) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });
});
