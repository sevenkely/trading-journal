import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHiddenIds, scheduleDeletion, UNDO_DELAY_MS } from '../lib/pendingDeletion';

describe('suppression différée', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('masque tout de suite, puis lance la suppression après le délai', async () => {
    const commit = vi.fn(async () => undefined);
    scheduleDeletion(['a', 'b'], commit);

    expect([...getHiddenIds()].sort()).toEqual(['a', 'b']);
    expect(commit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(UNDO_DELAY_MS - 1);
    expect(commit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledTimes(1);

    // Une fois la suppression terminée, les ids ne sont plus masqués
    await vi.advanceTimersByTimeAsync(0);
    expect(getHiddenIds().size).toBe(0);
  });

  it('l’annulation évite la suppression et rend les ids visibles', async () => {
    const commit = vi.fn(async () => undefined);
    const cancel = scheduleDeletion(['x'], commit);

    cancel();
    expect(getHiddenIds().has('x')).toBe(false);

    await vi.advanceTimersByTimeAsync(UNDO_DELAY_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it('l’annulation n’a plus d’effet une fois la suppression lancée', async () => {
    const commit = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 100)));
    const cancel = scheduleDeletion(['y'], commit);

    await vi.advanceTimersByTimeAsync(UNDO_DELAY_MS);
    cancel();
    expect(getHiddenIds().has('y')).toBe(true); // masqué pendant l’envoi

    await vi.advanceTimersByTimeAsync(100);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(getHiddenIds().has('y')).toBe(false);
  });

  it('une erreur pendant la suppression libère l’état masqué sans exception', async () => {
    const commit = vi.fn(() => Promise.reject(new Error('réseau')));
    scheduleDeletion(['z'], commit);

    await vi.advanceTimersByTimeAsync(UNDO_DELAY_MS);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(getHiddenIds().size).toBe(0);
  });
});
