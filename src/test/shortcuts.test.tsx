// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useShortcuts } from '../components/useShortcuts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  document.querySelectorAll('[role="dialog"]').forEach((node) => node.remove());
});

function Harness() {
  useShortcuts();
  const { pathname } = useLocation();
  return (
    <div>
      <p data-testid="where">{pathname}</p>
      <input aria-label="Recherche de test" />
    </div>
  );
}

async function render(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const target = root;
  await act(async () => {
    target.render(
      <MemoryRouter initialEntries={['/']}>
        <Harness />
      </MemoryRouter>,
    );
  });
}

function where(): string | null | undefined {
  return host?.querySelector('[data-testid="where"]')?.textContent;
}

async function press(key: string, target: EventTarget = window) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('raccourcis clavier', () => {
  it('N ouvre un nouveau trade', async () => {
    await render();
    await press('n');
    expect(where()).toBe('/trades/nouveau');
  });

  it('G puis une lettre va à la page correspondante', async () => {
    await render();
    await press('g');
    await press('t');
    expect(where()).toBe('/trades');

    await press('g');
    await press('a');
    expect(where()).toBe('/analyse');
  });

  it('une lettre inconnue après G ne navigue pas', async () => {
    await render();
    await press('g');
    await press('z');
    expect(where()).toBe('/');
  });

  it('ne réagit pas pendant la saisie dans un champ', async () => {
    await render();
    const input = host?.querySelector('input') as HTMLInputElement;
    await press('n', input);
    expect(where()).toBe('/');
  });

  it('ne réagit pas quand une fenêtre est ouverte', async () => {
    await render();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    await press('n');
    expect(where()).toBe('/');
  });

  it('ignore les combinaisons avec Ctrl ou Cmd', async () => {
    await render();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true }));
    });
    expect(where()).toBe('/');
  });
});
