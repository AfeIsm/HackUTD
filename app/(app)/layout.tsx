import { AppHeader } from '@/components/AppHeader';
import { SessionGate } from '@/components/SessionGate';

// Shared shell for the signed-in pages: header + page width. SessionGate = must be logged in.
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="mx-auto box-border flex max-w-[1200px] flex-col gap-6 px-6 pb-16">
      <AppHeader />
      <SessionGate>{children}</SessionGate>
    </div>
  );
}
