import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { SignupForm } from '@/components/SignupForm';

export const metadata: Metadata = { title: 'Sign up · Wallet Whisperer' };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Your finances stay private. Friends only ever see what you choose to share."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-accent">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
