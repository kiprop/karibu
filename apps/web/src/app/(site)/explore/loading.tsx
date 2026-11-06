/** Shown while results load, so the page never goes blank. */
export default function Loading() {
  return (
    <div className="container-k py-8" aria-busy="true" aria-label="Loading results">
      <div className="h-9 w-72 animate-pulse rounded-lg bg-soft" />
      <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-soft" />
      <div className="mt-6 flex gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-9 w-24 animate-pulse rounded-lg bg-soft" />)}</div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="hidden h-96 animate-pulse rounded-xl bg-soft lg:block" />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}><div className="aspect-[4/3] animate-pulse rounded-xl bg-soft" /><div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-soft" /><div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-soft" /></div>
          ))}
        </div>
      </div>
    </div>
  );
}
