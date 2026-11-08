'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useMe } from '@/lib/useMe';
import { CardFace } from './CardFace';
import { type CardId } from './cards';
import { useWallet } from './WalletContext';

export function PageShell({ id, eyebrow, title, intro, actions, children, showDemoNotice = true }: {
  id: CardId; eyebrow?: string; title: ReactNode; intro?: ReactNode; actions?: ReactNode; children: ReactNode; showDemoNotice?: boolean;
}) {
  const w = useWallet();
  const me = useMe();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [id]);
  return (
    <div className="page-wrap">
      <article className={`page-sheet page-${id}`}>
        <header className="page-header">
          <div className="page-header-face" aria-hidden="true"><CardFace id={id} /></div>
          <div className="page-header-inner">
            <button type="button" className="back-btn" onClick={w.backToWallet}>← Back to wallet</button>
            {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
            <h1 ref={heading} tabIndex={-1} className="page-title font-display focus:outline-none">{title}</h1>
            {intro && <div className="page-intro">{intro}</div>}
            {actions && <div className="mt-4 flex flex-wrap gap-3">{actions}</div>}
          </div>
        </header>
        <div className="page-body">
          {showDemoNotice && me.status === 'in' && me.user.memberId?.startsWith('user-') && <p className="text-xs text-muted">Demo finances · synthetic Nessie banking data · assessment date November 7, 2026</p>}
          {children}
        </div>
      </article>
    </div>
  );
}
