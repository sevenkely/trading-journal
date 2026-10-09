// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmProvider, useConfirm } from '../components/ConfirmDialog';

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
});

function Probe({ onResult }: { onResult: (ok: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={async () =>
        onResult(
          await confirm({
            title: 'Supprimer le compte ?',
            description: 'Action irréversible.',
            confirmLabel: 'Supprimer',
            danger: true,
          }),
        )
      }
    >
      Demander
    </button>
  );
}

async function render(onResult: (ok: boolean) => void): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const target = root;
  await act(async () => {
    target.render(
      <MemoryRouter>
        <ConfirmProvider>
          <Probe onResult={onResult} />
        </ConfirmProvider>
      </MemoryRouter>,
    );
  });
  return host;
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="alertdialog"]');
}

function button(el: ParentNode, text: string): HTMLButtonElement {
  const found = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`Bouton introuvable : ${text}`);
  return found;
}

/** La boîte joue une animation de sortie : on attend qu’elle soit retirée du DOM. */
async function untilClosed(): Promise<void> {
  const started = Date.now();
  while (dialog() && Date.now() - started < 3_000) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

async function open(el: HTMLElement) {
  await act(async () => {
    button(el, 'Demander').click();
  });
}

describe('boîte de confirmation accessible', () => {
  it('est un alertdialog modal nommé, et le focus part sur « Annuler »', async () => {
    const el = await render(() => undefined);
    await open(el);

    const d = dialog();
    expect(d).not.toBeNull();
    expect(d?.getAttribute('aria-modal')).toBe('true');
    const labelledBy = d?.getAttribute('aria-labelledby') ?? '';
    expect(document.getElementById(labelledBy)?.textContent).toBe('Supprimer le compte ?');
    expect(document.activeElement?.textContent).toBe('Annuler');
  });

  it('renvoie true à la validation', async () => {
    const answers: boolean[] = [];
    const el = await render((ok) => answers.push(ok));
    await open(el);

    await act(async () => {
      button(dialog() ?? document.body, 'Supprimer').click();
    });
    await untilClosed();
    expect(answers).toEqual([true]);
    expect(dialog()).toBeNull();
  });

  it('renvoie false à « Annuler » et à la touche Échap', async () => {
    const answers: boolean[] = [];
    const el = await render((ok) => answers.push(ok));
    await open(el);
    await act(async () => {
      button(dialog() ?? document.body, 'Annuler').click();
    });
    await untilClosed();

    await open(el);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await untilClosed();
    expect(answers).toEqual([false, false]);
    expect(dialog()).toBeNull();
  });

  it('boucle le Tab à l’intérieur de la fenêtre', async () => {
    const el = await render(() => undefined);
    await open(el);
    const panel = dialog() ?? document.body;
    const confirmButton = button(panel, 'Supprimer');
    const cancelButton = button(panel, 'Annuler');

    await act(async () => {
      confirmButton.focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    });
    expect(document.activeElement).toBe(cancelButton);
  });
});
