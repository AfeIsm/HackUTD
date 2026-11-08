import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = { title: 'Log in · Wallet Whisperer' };

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to see your money and your huddles."
      footer={
        <>
          New here?{' '}
          <Link href="/signup" className="font-semibold text-accent">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
