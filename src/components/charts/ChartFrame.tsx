import { useId, type ReactNode } from 'react';
import { Card, cn } from '../ui';

/** Cadre commun des graphiques : titre, actions, contenu et notes. Reste lisible à l’impression. */
export function ChartFrame({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return (
    <Card className={cn('p-5 md:p-6 print:break-inside-avoid', className)}>
      <section aria-labelledby={titleId} className="min-w-0">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-semibold tracking-tight text-fg">
              {title}
            </h3>
            {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
          </div>
          {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </section>
    </Card>
  );
}

/** Tableau de données alternatif, replié sous le graphique : même information, lisible au clavier et par lecteur d’écran. */
export function ChartTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    <details className="mt-4 overflow-hidden rounded-xl border border-line bg-surface-2/30">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium text-fg-2 transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
        Voir les données en tableau
      </summary>
      <div className="max-h-72 overflow-auto border-t border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
            <tr>
              {head.map((label, i) => (
                <th key={label} scope="col" className={cn('px-3 py-2 font-medium', i > 0 && 'text-right')}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className={cn('px-3 py-2 tabular-nums', c === 0 ? 'text-fg-2' : 'text-right')}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Carte d’info-bulle riche : titre puis lignes libellé / valeur. */
export function TooltipCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-44 rounded-xl border border-line-2 bg-surface-2 px-3 py-2.5 text-xs shadow-overlay">
      <div className="mb-1.5 font-medium text-fg">{title}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">{children}</dl>
    </div>
  );
}

export function TooltipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right tabular-nums text-fg-2">{children}</dd>
    </>
  );
}

/** Message affiché à la place d’un graphique vide, avec la raison. */
export function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-40 place-items-center rounded-xl border border-dashed border-line-2 px-6 text-center text-sm text-muted">
      <p>{children}</p>
    </div>
  );
}
