import type { Repo } from './repo';
import type { Trade, TradeInput } from './types';
import { newUuid } from './utils';

/** Nombre maximum de captures par trade (appliqué dans l’interface ; la base ne le contrôle pas). */
export const MAX_SCREENSHOTS = 4;

/** Taille maximale acceptée avant compression. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

/** Côté le plus long après réduction : assez net pour lire les chiffres d’un graphique. */
export const MAX_SIDE = 1920;

/** En dessous de ce poids, et si l’image n’a pas besoin d’être réduite, le fichier est envoyé tel quel. */
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

/** Message d’erreur si le fichier ne peut pas être une capture, sinon null. */
export function validateScreenshotFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'format non pris en charge (PNG, JPEG ou WebP).';
  if (file.size > MAX_SOURCE_BYTES) return 'fichier trop lourd (25 Mo maximum).';
  return null;
}

/** Dimensions après réduction proportionnelle : le côté le plus long ne dépasse pas `maxSide`. */
export function fitWithin(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const ratio = maxSide / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

/**
 * Prépare une capture avant envoi : réduit le côté le plus long à 1920 px et l’encode en WebP
 * (JPEG si le navigateur ne sait pas encoder le WebP). Une petite image reste inchangée.
 * Le fond est blanc, pour que les zones transparentes restent lisibles en JPEG.
 */
export async function prepareScreenshot(file: File): Promise<File> {
  const problem = validateScreenshotFile(file);
  if (problem) throw new Error(`« ${file.name} » : ${problem}`);

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null; // fichier corrompu, ou décodage impossible dans ce navigateur
  }
  if (!bitmap) throw new Error(`« ${file.name} » n’est pas une image lisible.`);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const resized = width !== bitmap.width || height !== bitmap.height;
    if (!resized && file.size <= KEEP_AS_IS_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Impossible de préparer la capture : canvas indisponible.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    let type = 'image/webp';
    let blob = await canvasToBlob(canvas, type, 0.9);
    // Certains navigateurs renvoient du PNG quand le WebP n’est pas encodable : on repasse en JPEG
    if (!blob || blob.type !== type) {
      type = 'image/jpeg';
      blob = await canvasToBlob(canvas, type, 0.9);
    }
    if (!blob) throw new Error(`« ${file.name} » : compression impossible.`);

    const base = file.name.replace(/\.[^.]+$/, '') || 'capture';
    return new File([blob], `${base}.${type === 'image/webp' ? 'webp' : 'jpg'}`, { type });
  } finally {
    bitmap.close();
  }
}

/**
 * Crée un trade avec ses captures. L’identifiant est choisi avant l’envoi, pour que le chemin de chaque fichier
 * contienne déjà celui du trade. Si une étape échoue, les fichiers déjà envoyés sont supprimés et l’erreur remonte.
 */
export async function createTradeWithScreenshots(repo: Repo, input: TradeInput, files: File[]): Promise<Trade> {
  const id = newUuid();
  const paths: string[] = [];
  try {
    for (const file of files) paths.push(await repo.uploadScreenshot(id, file));
    return await repo.createTrade(input, { id, screenshots: paths });
  } catch (error) {
    await Promise.allSettled(paths.map((path) => repo.deleteScreenshotFile(path)));
    throw error;
  }
}
