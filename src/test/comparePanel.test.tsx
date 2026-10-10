// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ComparePanel } from '../components/ComparePanel';
import { makeAccount, makeTrade } from './fixtures';
import type { Trade } from '../lib/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

const ACCOUNTS = [makeAccount({ id: 'a1', name: 'FTMO Test' }), makeAccount({ id: 'a2', name: 'Compte perso' })];

/** Deux fenêtres de 7 jours : −100 sur la précédente (8 à 14 j), +700 sur la fenêtre actuelle (0 à 7 j). */
const TRADES: Trade[] = [
  makeTrade({ id: 'old-win', account_id: 'a1', opened_at: daysAgo(12), closed_at: daysAgo(12), gross_pnl: 200, fees: 0 }),
  makeTrade({ id: 'old-loss', account_id: 'a1', opened_at: daysAgo(8), closed_at: daysAgo(8), gross_pnl: -300, fees: 0 }),
  makeTrade({ id: 'now-win', account_id: 'a1', opened_at: daysAgo(5), closed_at: daysAgo(5), gross_pnl: 900, fees: 0 }),
  makeTrade({ id: 'now-loss', account_id: 'a2', opened_at: daysAgo(2), closed_at: daysAgo(2), gross_pnl: -200, fees: 0 }),
];

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
});

async function render(trades: Trade[]): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const target = root;
  await act(async () => {
    target.render(
      <ComparePanel
        trades={trades}
        accounts={ACCOUNTS}
        tz="UTC"
        currency="USD"
        periods={[
          { value: 30, label: '30 jours' },
          { value: 90, label: '90 jours' },
          { value: 0, label: 'Tout' },
        ]}
      />,
    );
  });
  return host;
}

describe('comparaison de deux périmètres', () => {
  it('compare par défaut deux fenêtres consécutives et chiffre le progrès', async () => {
    const el = await render(TRADES);
    expect(el.textContent).toContain('Période précédente');
    expect(el.textContent).toContain('Période actuelle');
    // −100 puis +700 : le P&L net progresse de 800
    expect(el.textContent).toContain('progresse');
    expect(el.textContent).toContain('800');
    // Un indicateur par ligne, avec son écart
    expect(el.querySelectorAll('th[scope="row"]')).toHaveLength(12);
    expect(el.querySelector('[aria-label="Compte comparé"]')).not.toBeNull();
  });

  it('bascule sur deux comptes et nomme les deux côtés', async () => {
    const el = await render(TRADES);
    const modeButton = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Deux comptes');
    expect(modeButton).toBeDefined();
    await act(async () => {
      modeButton?.click();
    });
    expect(el.querySelector('[aria-label="Premier compte"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Second compte"]')).not.toBeNull();
    expect(el.textContent).toContain('FTMO Test');
    expect(el.textContent).toContain('Compte perso');
  });

  it('explique l’absence de trades des deux côtés', async () => {
    const el = await render([]);
    expect(el.textContent).toContain('Aucun trade dans l’un ou l’autre périmètre');
  });

  it('n’affiche aucun écart quand un seul côté a des trades', async () => {
    const recent = TRADES.filter((t) => t.id.startsWith('now'));
    const el = await render(recent);
    expect(el.textContent).toContain('l’écart n’a rien à comparer');
    // Les valeurs restent lisibles des deux côtés
    expect(el.textContent).toContain('700');
    // Aucun verdict de progrès n’est affiché pour une période vide
    expect(el.textContent).not.toContain('progresse');
    expect(el.textContent).not.toContain('indicateur(s) en progrès');
  });
});
