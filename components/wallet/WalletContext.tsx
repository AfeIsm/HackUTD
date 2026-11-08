'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useMe } from '@/lib/useMe';
import { CARDS, cardForPath, type CardId } from './cards';

export type FlightPhase = 'start' | 'lift' | 'expand' | 'settle' | 'full' | 'shrink' | 'insert';
export type Flight = { id: CardId; phase: FlightPhase; slot: DOMRect | null };
export const MOTION = { unfold: 900, lift: 260, expand: 520, settle: 220, shrink: 420, insert: 260 };
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const getMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type WalletCtx = {
  open: boolean; instant: boolean; reduced: boolean;
  openWallet: () => void; closeWallet: () => void;
  loggingOut: boolean; closeForLogout: () => Promise<void>;
  loginOpen: boolean; loginMode: 'login' | 'signup'; loginNext: string;
  openLogin: (then?: CardId | null) => void; closeLogin: () => void;
  side: 'left' | 'right'; setSide: (side: 'left' | 'right') => void;
  flight: Flight | null; activeCard: CardId | null;
  openCard: (id: CardId) => void; backToWallet: () => void;
  registerSlot: (id: CardId, el: HTMLElement | null) => void;
};
const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const activeCard = cardForPath(pathname);
  const authRoute = pathname === '/login' || pathname === '/signup';
  const [opened, setOpened] = useState<boolean | null>(null);
  const [sideChoice, setSide] = useState<'left' | 'right' | null>(null);
  const [login, setLogin] = useState<{ next: string } | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [instant, setInstant] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotion, getMotion, () => false);
  const slots = useRef(new Map<CardId, HTMLElement>());
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const open = opened ?? (me.status === 'in' || activeCard !== null || authRoute);
  const side = sideChoice ?? (me.status === 'in' ? 'right' : 'left');

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    busy.current = false;
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, reduced ? Math.min(ms, 50) : ms));
  }, [reduced]);
  useEffect(() => {
    const mounted = setTimeout(() => setInstant(false), 60);
    // Back/Forward must not leave a partially extracted card or a locked wallet.
    const cancel = () => { clearTimers(); setFlight(null); setLogin(null); };
    window.addEventListener('popstate', cancel);
    return () => { clearTimeout(mounted); window.removeEventListener('popstate', cancel); clearTimers(); };
  }, [clearTimers]);

  const registerSlot = useCallback((id: CardId, el: HTMLElement | null) => {
    if (el) slots.current.set(id, el);
    else slots.current.delete(id);
  }, []);
  const openCard = useCallback((id: CardId) => {
    if (busy.current) return;
    if (me.status !== 'in') {
      setOpened(true);
      setLogin({ next: CARDS[id].to });
      return;
    }
    setSide('right');
    setOpened(true);
    const el = slots.current.get(id);
    if (reduced || !el) { router.push(CARDS[id].to); return; }
    busy.current = true;
    setFlight({ id, phase: 'start', slot: (el.querySelector('.card-face') ?? el).getBoundingClientRect() });
    later(() => setFlight(f => f && { ...f, phase: 'lift' }), 32);
    later(() => setFlight(f => f && { ...f, phase: 'expand' }), MOTION.lift + 32);
    later(() => {
      router.push(CARDS[id].to, { scroll: true });
      setFlight(f => f && { ...f, phase: 'settle' });
    }, MOTION.lift + MOTION.expand + 32);
    later(() => { setFlight(null); busy.current = false; }, MOTION.lift + MOTION.expand + MOTION.settle + 32);
  }, [me.status, reduced, router, later]);

  const backToWallet = useCallback(() => {
    clearTimers();
    setOpened(true);
    setSide('right');
    setLogin(null);
    const id = activeCard;
    if (!id || reduced) {
      setFlight(null); router.push('/');
      if (id) later(() => slots.current.get(id)?.focus({ preventScroll: true }), 100);
      return;
    }
    busy.current = true;
    window.scrollTo(0, 0);
    setFlight({ id, phase: 'full', slot: null });
    router.push('/', { scroll: true });
    later(() => {
      const el = slots.current.get(id);
      const slot = el ? (el.querySelector('.card-face') ?? el).getBoundingClientRect() : null;
      setFlight({ id, phase: 'shrink', slot });
    }, 40);
    later(() => setFlight(f => f && { ...f, phase: 'insert' }), MOTION.shrink + 60);
    later(() => {
      setFlight(null); busy.current = false;
      later(() => slots.current.get(id)?.focus({ preventScroll: true }), 32);
    }, MOTION.shrink + MOTION.insert + 100);
  }, [activeCard, reduced, router, later, clearTimers]);

  // Resolves once the wallet has shut. A page's card goes back in its slot first.
  const closeForLogout = useCallback(() => new Promise<void>((resolve) => {
    setLoggingOut(true);
    const shut = () => {
      setLogin(null); setSide('left'); setOpened(false);
      later(resolve, MOTION.unfold + 120);
    };
    if (!activeCard) { shut(); return; }
    backToWallet();
    later(shut, MOTION.shrink + MOTION.insert + 140);
  }), [activeCard, backToWallet, later]);

  const value = useMemo<WalletCtx>(() => ({
    open, instant, reduced, side, setSide, loggingOut, closeForLogout,
    openWallet: () => setOpened(true),
    closeWallet: () => { clearTimers(); setFlight(null); setLogin(null); setSide('left'); setOpened(false); },
    loginOpen: login !== null || (authRoute && me.status !== 'in'),
    loginMode: pathname === '/signup' ? 'signup' : 'login',
    loginNext: login?.next ?? '/',
    openLogin: (then = null) => { setOpened(true); setLogin({ next: then ? CARDS[then].to : '/' }); },
    closeLogin: () => { setLogin(null); if (authRoute) { setOpened(true); router.replace('/'); } },
    flight, activeCard, openCard, backToWallet, registerSlot,
  }), [open, instant, reduced, side, loggingOut, closeForLogout, login, authRoute, me.status, pathname, flight, activeCard, openCard, backToWallet, registerSlot, clearTimers, router]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const value = useContext(Ctx);
  if (!value) throw new Error('Wallet components require WalletProvider');
  return value;
}
