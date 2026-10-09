import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { useRepo } from '../data/hooks';
import { MAX_SCREENSHOTS, prepareScreenshot, validateScreenshotFile } from '../lib/screenshots';
import { errorMessage } from './Toast';
import { Button, cn } from './ui';

/** Vignette d’une capture enregistrée. Sans `onRemove`, la vignette ne fait que consulter. */
export function ShotThumb({ path, onRemove, className = 'w-44' }: { path: string; onRemove?: () => void; className?: string }) {
  const repo = useRepo();
  const { data: url } = useQuery({
    queryKey: ['screenshot', path],
    queryFn: () => repo.getScreenshotUrl(path),
    staleTime: 30 * 60_000,
  });

  return (
    <div className={cn('group relative h-28 max-w-full overflow-hidden rounded-xl border border-line-2 bg-ink', className)}>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block h-full w-full"
          aria-label="Ouvrir la capture dans un nouvel onglet"
        >
          <img src={url} alt="Capture du trade" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        </a>
      ) : (
        <div className="skeleton flex h-full items-center justify-center rounded-none text-xs text-muted">Chargement…</div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-1.5 top-1.5 rounded-lg bg-ink/85 p-1.5 text-fg-2 opacity-100 transition hover:text-loss md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          aria-label="Supprimer la capture"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Vignette d’une capture pas encore envoyée (nouveau trade). */
export function PendingShotThumb({ url, index, onRemove }: { url: string; index: number; onRemove: () => void }) {
  return (
    <div className="group relative h-28 w-44 max-w-full overflow-hidden rounded-xl border border-line-2 bg-ink">
      <img src={url} alt={`Capture ${index + 1}, en attente d’enregistrement`} className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 rounded-lg bg-ink/85 p-1.5 text-fg-2 opacity-100 transition hover:text-loss md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        aria-label={`Retirer la capture ${index + 1}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** Garde la dernière version d’un callback pour un écouteur global, sans le réabonner à chaque rendu. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Colle des images (Ctrl+V ou ⌘+V) n’importe où dans la page, tant que `enabled` est vrai. Le texte collé n’est pas touché. */
function usePasteImages(enabled: boolean, onImages: (files: File[]) => void) {
  const latest = useLatest(onImages);
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (event: ClipboardEvent) => {
      const images = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
      if (images.length === 0) return;
      event.preventDefault();
      latest.current(images);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [enabled, latest]);
}

/**
 * Zone d’ajout de captures : bouton, glisser-déposer et collage. Les fichiers sont vérifiés et compressés ici,
 * puis remis à `onFiles`. Le nombre de captures déjà présentes (`count`) limite ce qui peut être ajouté.
 */
export function ScreenshotDropzone({
  count,
  disabled = false,
  onFiles,
}: {
  count: number;
  disabled?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const room = MAX_SCREENSHOTS - count;
  const full = room <= 0;
  const locked = disabled || busy || full;

  const addFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (files.length === 0) return;
    if (full) {
      setMessage(`Limite atteinte : ${MAX_SCREENSHOTS} captures par trade.`);
      return;
    }
    const notes: string[] = [];
    if (files.length > room) {
      notes.push(`${files.length - room} fichier(s) ignoré(s) : ${MAX_SCREENSHOTS} captures au maximum par trade.`);
    }
    const candidates = files.slice(0, room).filter((file) => {
      const problem = validateScreenshotFile(file);
      if (problem) notes.push(`« ${file.name} » : ${problem}`);
      return !problem;
    });

    setBusy(true);
    setMessage(null);
    try {
      const prepared: File[] = [];
      for (const file of candidates) prepared.push(await prepareScreenshot(file));
      if (prepared.length > 0) await onFiles(prepared);
    } catch (error) {
      notes.push(errorMessage(error));
    } finally {
      setBusy(false);
    }
    setMessage(notes.length > 0 ? notes.join(' ') : null);
  };

  usePasteImages(!locked, (files) => void addFiles(files));

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!locked) void addFiles(event.dataTransfer.files);
  };

  const hint: ReactNode = full ? (
    <>Limite atteinte : {MAX_SCREENSHOTS} captures par trade.</>
  ) : (
    <>Glisse des images ici, colle-les avec Ctrl+V (⌘+V sur Mac) ou choisis des fichiers.</>
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!locked) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'rounded-2xl border border-dashed p-5 transition-colors duration-200',
        dragging ? 'border-accent/60 bg-accent/5' : 'border-line-2 bg-surface-2/40',
        locked && !busy && 'opacity-80',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-fg-2">{hint}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            PNG, JPEG ou WebP. Réduites à 1920 px et compressées avant envoi. {full ? '' : `${room} emplacement(s) restant(s) sur ${MAX_SCREENSHOTS}.`}
          </p>
        </div>
        <Button variant="secondary" disabled={locked} loading={busy} onClick={() => inputRef.current?.click()} className="shrink-0">
          <ImagePlus className="h-4 w-4" aria-hidden />
          {busy ? 'Préparation…' : 'Choisir des fichiers'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          tabIndex={-1}
          onChange={(event) => {
            if (event.target.files) void addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
      {message && (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-loss">
          {message}
        </p>
      )}
    </div>
  );
}
