import type { Metadata } from 'next';
import './admin.css';

export const metadata: Metadata = {
  title: { default: 'Staff console', template: '%s · Karibu staff' },
  robots: { index: false, follow: false },
};

/** The staff console has its own frame and sign-in, separate from traveller and business accounts. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="adm">{children}</div>;
}
