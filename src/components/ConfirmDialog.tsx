import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Info } from 'lucide-react';
import { trapFocus } from './focusTrap';
import { EASE, buttonStyles, cn } from './ui';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Libellé du bouton de validation. */
  confirmLabel?: string;
  /** Validation destructive : bouton rouge, icône d’alerte. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface Request extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Fournit `useConfirm` : une boîte de dialogue accessible, à la place de window.confirm. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const current = useRef<Request | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        current.current?.resolve(false); // une seule demande à la fois
        current.current = { ...options, resolve };
        setRequest(current.current);
      }),
    [],
  );

  const answer = useCallback((ok: boolean) => {
    current.current?.resolve(ok);
    current.current = null;
    setRequest(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {request && <ConfirmModal key={request.title} request={request} onAnswer={answer} />}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

/** Ouvre la confirmation et renvoie true si l’utilisateur valide. */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm doit être utilisé à l’intérieur de ConfirmProvider');
  return confirm;
}

function ConfirmModal({ request, onAnswer }: { request: Request; onAnswer: (ok: boolean) => void }) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  // Le focus part sur « Annuler » : une validation par erreur n’est pas la voie par défaut
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onAnswer(false);
      } else if (event.key === 'Tab' && panelRef.current) {
        trapFocus(event, panelRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAnswer]);

  const Icon = request.danger ? AlertTriangle : Info;

  return (
    <motion.div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/70 p-4 backdrop-blur-[2px]"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => onAnswer(false)}
    >
      <motion.div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={request.description ? descId : undefined}
        onClick={(event) => event.stopPropagation()}
        initial={reduce ? false : { opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.22, ease: EASE }}
        className="w-full max-w-md rounded-card border border-line-2 bg-surface p-6 shadow-overlay"
      >
        <div className="flex items-start gap-4">
          <span
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
              request.danger ? 'bg-loss/10 text-loss' : 'bg-info/10 text-info',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-fg">
              {request.title}
            </h2>
            {request.description && (
              <p id={descId} className="mt-2 text-sm leading-relaxed text-muted">
                {request.description}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" className={buttonStyles('secondary')} onClick={() => onAnswer(false)}>
            Annuler
          </button>
          <button
            type="button"
            className={buttonStyles(request.danger ? 'danger' : 'primary')}
            onClick={() => onAnswer(true)}
          >
            {request.confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
