import { cn } from './ui';

/** Bloc de chargement : garde la place du contenu final pour éviter le saut de mise en page. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-surface-3/70', className)} />;
}

/** Squelette du tableau de bord, à la forme finale : ligne KPI, bloc principal, calendrier, P&L par jour. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Chargement du tableau de bord…</span>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-surface p-4 md:p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-3 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-[30rem] lg:col-span-8" />
        <div className="flex flex-col gap-4 lg:col-span-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-[22rem]" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-96 lg:col-span-5" />
        <Skeleton className="h-96 lg:col-span-7" />
      </div>
    </div>
  );
}
