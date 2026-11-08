import { SessionGate } from '@/components/SessionGate';

// Shared shell for the signed-in pages: header + page width. SessionGate = must be logged in.
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <SessionGate>{children}</SessionGate>
  );
}
