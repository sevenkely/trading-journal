import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId, newUuid } from './utils';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('identifiants', () => {
  it('newUuid produit un UUID v4', () => {
    expect(newUuid()).toMatch(UUID_V4);
  });

  it('newId produit aussi un UUID v4, valide pour une colonne uuid de Postgres', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('deux appels donnent deux identifiants distincts', () => {
    expect(newUuid()).not.toBe(newUuid());
  });

  it('reste un UUID v4 sans crypto.randomUUID (contexte non sécurisé)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });
    expect(newUuid()).toMatch(UUID_V4);
  });
});
