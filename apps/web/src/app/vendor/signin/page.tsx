import { redirect } from 'next/navigation';

// Businesses use the same sign-in as everyone else. Kept so old links keep working.
export default function VendorSignIn() {
  redirect('/signin?for=business&next=/vendor');
}
