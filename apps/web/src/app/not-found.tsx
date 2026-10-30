import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-k py-20 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold">We couldn’t find that page</h1>
      <p className="mt-2 text-muted">It may have moved, or the listing is no longer live.</p>
      <Link href="/explore" className="btn-primary mt-6">Explore places</Link>
    </div>
  );
}
