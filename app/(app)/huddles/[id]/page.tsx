import { Suspense } from 'react';
import { HuddleDetail } from '@/components/HuddleDetail';
import { Card } from '@/components/ui';

// Next 16 (cacheComponents): reading params must happen inside <Suspense>.
export default function HuddlePage(props: PageProps<'/huddles/[id]'>) {
  return (
    <Suspense fallback={<Card><p className="m-0 text-ink-2">Loading huddle…</p></Card>}>
      <HuddleById params={props.params} />
    </Suspense>
  );
}

async function HuddleById({ params }: Pick<PageProps<'/huddles/[id]'>, 'params'>) {
  const { id } = await params;
  return <HuddleDetail id={id} />;
}
