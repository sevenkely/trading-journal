import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from './ui';

type ToastKind = 'success' | 'error' | 'info';

/** Action proposée dans la notification (ex. « Annuler » après une suppression). */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-gain" aria-hidden />,
  error: <AlertTriangle className="h-4 w-4 text-loss" aria-hidden />,
  info: <Info className="h-4 w-4 text-info" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = 'success', action?: ToastAction) => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, kind, message, action }]);
      // Avec une action (Annuler), la notification reste le temps du délai d’annulation (6 s)
      window.setTimeout(() => dismiss(id), action ? 6000 : kind === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-24 z-50 flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              role="status"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className={cn(
                'pointer-events-auto flex w-[min(24rem,calc(100vw-1.5rem))] items-start gap-3 rounded-2xl border bg-surface-2/95 p-3.5 text-sm text-fg shadow-2xl shadow-black/50 backdrop-blur-xl',
                t.kind === 'error' ? 'border-loss/30' : 'border-line-2',
              )}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-3">{ICONS[t.kind]}</span>
              <span className="flex-1 break-words pt-0.5 leading-relaxed text-fg-2">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold text-accent-hi transition-colors hover:bg-surface-3"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-surface-3 hover:text-fg"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast doit être utilisé à l’intérieur de ToastProvider');
  return api;
}

/** Extrait un message lisible d'une erreur inconnue. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Une erreur inattendue est survenue.';
}
