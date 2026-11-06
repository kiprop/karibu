export default function Loading() {
  return (
    <div className="container-k py-6" aria-busy="true" aria-label="Loading listing">
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-soft" />
      <div className="mt-4 h-9 w-2/3 animate-pulse rounded-lg bg-soft" />
      <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-soft" />
      <div className="mt-5 h-[260px] animate-pulse rounded-2xl bg-soft sm:h-[400px]" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-4 animate-pulse rounded bg-soft" style={{ width: `${90 - i * 10}%` }} />)}</div>
        <div className="h-64 animate-pulse rounded-xl bg-soft" />
      </div>
    </div>
  );
}
