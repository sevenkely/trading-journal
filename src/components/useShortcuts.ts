import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** G puis une lettre : destination. */
export const GO_TO: Record<string, string> = {
  d: '/',
  t: '/trades',
  j: '/journal',
  a: '/analyse',
  b: '/bilan',
  c: '/comptes',
  i: '/import',
  p: '/parametres',
};

const CHORD_MS = 1200;

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/**
 * Raccourcis clavier : N ouvre un nouveau trade, G puis une lettre va à une page (G T : trades, G A : analyse…).
 * Inactifs pendant la saisie et quand une fenêtre (détail, confirmation, recherche) est ouverte.
 */
export function useShortcuts(): void {
  const navigate = useNavigate();
  useEffect(() => {
    let chordAt = 0;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = event.key.toLowerCase();
      const armed = chordAt > 0 && Date.now() - chordAt < CHORD_MS;
      chordAt = 0;
      if (armed && GO_TO[key]) {
        event.preventDefault();
        navigate(GO_TO[key]);
      } else if (key === 'g') {
        chordAt = Date.now();
      } else if (key === 'n') {
        event.preventDefault();
        navigate('/trades/nouveau');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
