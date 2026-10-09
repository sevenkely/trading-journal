import { useCallback } from 'react';
import { errorMessage, useToast } from '../components/Toast';
import { scheduleDeletion, UNDO_DELAY_MS } from '../lib/pendingDeletion';
import { useRefresh, useRepo } from './hooks';

/** Supprime des trades après un délai d’annulation, signalé par une notification « Annuler ». */
export function useUndoableTradeDelete(): (ids: string[], message: string) => void {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  return useCallback(
    (ids: string[], message: string) => {
      const cancel = scheduleDeletion(ids, async () => {
        try {
          await repo.deleteTrades(ids);
        } catch (error) {
          toast.show(errorMessage(error), 'error');
        } finally {
          await refresh();
        }
      });
      toast.show(message, 'info', { label: 'Annuler', onClick: cancel });
    },
    [repo, refresh, toast],
  );
}

export { UNDO_DELAY_MS };
