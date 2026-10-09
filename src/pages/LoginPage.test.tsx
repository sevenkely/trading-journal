// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';

// La logique d’authentification est simulée : on teste l’interface et ce qu’elle envoie.
const { signInWithEmail } = vi.hoisted(() => ({ signInWithEmail: vi.fn<(email: string) => Promise<void>>() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signInWithEmail }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  signInWithEmail.mockReset();
  signInWithEmail.mockResolvedValue(undefined);
});

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => current.unmount());
  }
  host?.remove();
  root = null;
  host = null;
});

async function render(): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const mounted = root;
  await act(async () => {
    mounted.render(<LoginPage />);
  });
  return host;
}

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

/** Saisit une valeur dans un champ, comme le ferait l’utilisateur (événement input). */
async function type(el: HTMLElement, selector: string, value: string) {
  const field = el.querySelector<HTMLInputElement>(selector);
  if (!field) throw new Error(`Champ introuvable : ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(el: HTMLElement, text: string): HTMLButtonElement {
  const found = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`Bouton introuvable : ${text}`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => {
    target.click();
  });
  await settle();
}

describe('page de connexion', () => {
  it('signale une adresse invalide en ligne, sans rien envoyer', async () => {
    const el = await render();
    await type(el, 'input[type="email"]', 'pas-un-mail');
    await click(button(el, 'Recevoir mon lien de connexion'));

    expect(signInWithEmail).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Entre une adresse e-mail valide');
    expect(el.querySelector('input[type="email"]')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('envoie le lien puis affiche la vérification avec le délai de renvoi', async () => {
    const el = await render();
    await type(el, 'input[type="email"]', '  toi@exemple.com ');
    await click(button(el, 'Recevoir mon lien de connexion'));

    expect(signInWithEmail).toHaveBeenCalledWith('toi@exemple.com');
    expect(el.textContent).toContain('Vérifie ta boîte mail');
    expect(el.textContent).toContain('toi@exemple.com');
    const resend = button(el, 'Renvoyer le lien dans 1:00');
    expect(resend.disabled).toBe(true);
  });

  it('traduit le refus des inscriptions en message clair pour un invité non inscrit', async () => {
    signInWithEmail.mockRejectedValue(new Error('Signups not allowed for otp'));
    const el = await render();
    await type(el, 'input[type="email"]', 'inconnu@exemple.com');
    await click(button(el, 'Recevoir mon lien de connexion'));

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Accès réservé aux personnes invitées');
    expect(el.textContent).not.toContain('Vérifie ta boîte mail');
  });

  it('revient au formulaire avec « Utiliser une autre adresse »', async () => {
    const el = await render();
    await type(el, 'input[type="email"]', 'toi@exemple.com');
    await click(button(el, 'Recevoir mon lien de connexion'));
    await click(button(el, 'Utiliser une autre adresse'));

    expect(el.textContent).not.toContain('Vérifie ta boîte mail');
    expect(el.querySelector<HTMLInputElement>('input[type="email"]')).not.toBeNull();
  });

  it('aucune violation WCAG A/AA sur l’écran de saisie ni sur l’écran d’envoi', async () => {
    const el = await render();
    const audit = async () => {
      const results = await axe.run(el, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
      });
      return results.violations.map((v) => `${v.id} (${v.nodes.length})`);
    };

    expect(await audit()).toEqual([]);

    await type(el, 'input[type="email"]', 'toi@exemple.com');
    await click(button(el, 'Recevoir mon lien de connexion'));
    expect(await audit()).toEqual([]);
  });
});
