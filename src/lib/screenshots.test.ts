// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Repo } from './repo';
import type { TradeInput } from './types';
import {
  MAX_SOURCE_BYTES,
  createTradeWithScreenshots,
  fitWithin,
  prepareScreenshot,
  validateScreenshotFile,
} from './screenshots';
import { tradeInput } from '../test/fixtures';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('validateScreenshotFile', () => {
  it('accepte PNG, JPEG et WebP', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(validateScreenshotFile({ type, size: 1000 })).toBeNull();
    }
  });

  it('refuse les autres formats', () => {
    expect(validateScreenshotFile({ type: 'image/gif', size: 1000 })).toMatch(/format non pris en charge/);
  });

  it('refuse un fichier au-delà de 25 Mo', () => {
    expect(validateScreenshotFile({ type: 'image/png', size: MAX_SOURCE_BYTES + 1 })).toMatch(/25 Mo/);
  });
});

describe('fitWithin', () => {
  it('réduit le côté le plus long à 1920 px en gardant les proportions', () => {
    expect(fitWithin(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(fitWithin(1000, 4000)).toEqual({ width: 480, height: 1920 });
  });

  it('ne touche pas à une image déjà assez petite', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

/** Décodage simulé : dimensions de l’image source. */
function stubImage(width: number, height: number) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close: vi.fn() })),
  );
}

/** Canvas simulé : `encode` dit quel format le navigateur produit pour un format demandé. */
function stubCanvas(encode: (requested: string) => string) {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback, type?: string) => {
    callback(new Blob(['encoded'], { type: encode(type ?? 'image/png') }));
  });
  return drawImage;
}

describe('prepareScreenshot', () => {
  it('garde telle quelle une petite image', async () => {
    stubImage(800, 600);
    const file = new File(['small'], 'petit.png', { type: 'image/png' });
    expect(await prepareScreenshot(file)).toBe(file);
  });

  it('réduit une grande image à 1920 px et l’encode en WebP', async () => {
    stubImage(3840, 2160);
    const drawImage = stubCanvas((requested) => requested);
    const file = new File(['big'.repeat(10)], 'graphique.png', { type: 'image/png' });

    const result = await prepareScreenshot(file);

    expect(result.type).toBe('image/webp');
    expect(result.name).toBe('graphique.webp');
    expect(drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1920, 1080]);
  });

  it('repasse en JPEG si le navigateur ne sait pas encoder le WebP', async () => {
    stubImage(3840, 2160);
    stubCanvas((requested) => (requested === 'image/webp' ? 'image/png' : requested));
    const file = new File(['big'.repeat(10)], 'graphique.png', { type: 'image/png' });

    const result = await prepareScreenshot(file);

    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('graphique.jpg');
  });

  it('refuse une image que le navigateur ne sait pas lire', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('décodage impossible');
      }),
    );
    const file = new File(['???'], 'casse.png', { type: 'image/png' });
    await expect(prepareScreenshot(file)).rejects.toThrow(/n’est pas une image lisible/);
  });

  it('refuse un format non pris en charge avant toute lecture', async () => {
    const file = new File(['gif'], 'anime.gif', { type: 'image/gif' });
    await expect(prepareScreenshot(file)).rejects.toThrow(/format non pris en charge/);
  });
});

/** Faux dépôt : envois de fichiers et création du trade, avec des échecs programmables. */
function makeRepo(options: { failUploadAt?: number; failInsert?: boolean } = {}) {
  let uploads = 0;
  const repo = {
    uploadScreenshot: vi.fn(async (tradeId: string, file: File) => {
      uploads += 1;
      if (options.failUploadAt === uploads) throw new Error('Réseau indisponible');
      return `u1/${tradeId}/${file.name}`;
    }),
    createTrade: vi.fn(async (input: TradeInput, extra?: { id?: string; screenshots?: string[] }) => {
      if (options.failInsert) throw new Error('Insertion refusée');
      return { ...input, id: extra?.id ?? '', screenshots: extra?.screenshots ?? [] };
    }),
    deleteScreenshotFile: vi.fn(async (_path: string) => undefined),
  };
  return repo;
}

const files = () => [
  new File(['a'], 'a.webp', { type: 'image/webp' }),
  new File(['b'], 'b.webp', { type: 'image/webp' }),
];

describe('createTradeWithScreenshots', () => {
  it('envoie les captures puis crée le trade avec le même identifiant', async () => {
    const repo = makeRepo();
    const trade = await createTradeWithScreenshots(repo as unknown as Repo, tradeInput(), files());

    expect(trade.id).toMatch(UUID_V4);
    expect(trade.screenshots).toEqual([`u1/${trade.id}/a.webp`, `u1/${trade.id}/b.webp`]);
    expect(repo.createTrade).toHaveBeenCalledWith(expect.anything(), { id: trade.id, screenshots: trade.screenshots });
    expect(repo.deleteScreenshotFile).not.toHaveBeenCalled();
  });

  it('crée le trade sans envoi quand il n’y a pas de capture', async () => {
    const repo = makeRepo();
    const trade = await createTradeWithScreenshots(repo as unknown as Repo, tradeInput(), []);
    expect(repo.uploadScreenshot).not.toHaveBeenCalled();
    expect(trade.screenshots).toEqual([]);
  });

  it('supprime les fichiers déjà envoyés si une capture échoue', async () => {
    const repo = makeRepo({ failUploadAt: 2 });
    await expect(createTradeWithScreenshots(repo as unknown as Repo, tradeInput(), files())).rejects.toThrow(
      'Réseau indisponible',
    );
    expect(repo.deleteScreenshotFile).toHaveBeenCalledTimes(1);
    expect(repo.deleteScreenshotFile.mock.calls[0][0]).toMatch(/\/a\.webp$/);
    expect(repo.createTrade).not.toHaveBeenCalled();
  });

  it('supprime tous les fichiers envoyés si l’insertion du trade échoue', async () => {
    const repo = makeRepo({ failInsert: true });
    await expect(createTradeWithScreenshots(repo as unknown as Repo, tradeInput(), files())).rejects.toThrow(
      'Insertion refusée',
    );
    expect(repo.deleteScreenshotFile).toHaveBeenCalledTimes(2);
  });
});
