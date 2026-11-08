'use client';

/* eslint-disable @next/next/no-img-element -- Local texture images repeat within the physical wallet and its animation layer. */

import { useEffect, useRef, useState } from "react";
import { useMe } from "@/lib/useMe";
import { CardFace } from "./CardFace";
import { CARDS, SLOT_ORDER, type CardId } from "./cards";
import { IdCard } from "./IdCard";
import { MOTION, useWallet } from "./WalletContext";
import { WalletFoldHandle } from "./WalletFoldHandle";
const leatherTexture = "/wallet/wallet-leather.jpg";
import { FallingBills } from "./FallingBills";

const HALF_W = 540;
const H = 420;

function useStageScale(open: boolean) {
  const [state, setState] = useState({ scale: 1, phone: false });
  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const phone = vw < 1000;
      const needed = !open || phone ? HALF_W : HALF_W * 2 + 80;
      const scale = Math.min(1, (vw - 40) / needed, (vh - 220) / (H + 50));
      setState({ scale: Math.max(scale, 0.3), phone });
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [open]);
  return state;
}

export function WalletScene() {
  const me = useMe();
  const user = me.status === "in" ? me.user : null;
  const w = useWallet();
  const { scale, phone } = useStageScale(w.open);
  const startBtn = useRef<HTMLButtonElement>(null);
  const idRef = useRef<HTMLButtonElement>(null);
  const returning = w.flight && ['full', 'shrink', 'insert'].includes(w.flight.phase);
  const pageOpen = w.activeCard !== null && !returning;

  // Real-time drag progress sync: null = not dragging, 0 = open, 1 = closed
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  // Shift: closed → center the folded object (right half). Phone → one half at a time.
  const openShift = phone
    ? (w.side === "left" ? HALF_W / 2 : -HALF_W / 2)
    : (user ? -36 : 0);
  const closedShift = -HALF_W / 2;

  let shift = 0;
  if (!w.open) shift = closedShift;
  else shift = openShift;

  const isDragging = dragProgress !== null;
  const currentProgress = dragProgress ?? (w.open ? 0 : 1);
  const liveShift = isDragging
    ? openShift + currentProgress * (closedShift - openShift)
    : shift;
  const liveRotation = isDragging
    ? currentProgress * 180
    : (w.open ? 0 : 180);
  const liveFrameWidth = isDragging
    ? (HALF_W + (1 - currentProgress) * HALF_W) * scale
    : (phone || !w.open ? HALF_W : HALF_W * 2) * scale;

  const start = () => {
    w.openWallet();
    window.setTimeout(() => idRef.current?.focus({ preventScroll: true }), w.reduced ? 50 : MOTION.unfold);
  };

  useEffect(() => {
    if (!w.open && !w.instant) startBtn.current?.focus({ preventScroll: true });
  }, [w.open, w.instant]);

  const dur = w.instant ? 0 : w.reduced ? 200 : MOTION.unfold;
  const transitionDur = isDragging ? 0 : dur;

  return (
    <div
      className={`wallet-stage ${pageOpen ? "is-secondary" : ""}`}
      aria-hidden={pageOpen || undefined}
      inert={pageOpen || undefined}
    >
      {!w.open && !pageOpen && !isDragging && <FallingBills />}
      <div className="wallet-frame" style={{ width: liveFrameWidth, height: H * scale }}>
      <div
        className="wallet"
        data-open={w.open}
        data-reduced={w.reduced}
        data-dragging={isDragging ? "true" : undefined}
        style={{
          width: HALF_W * 2,
          height: H,
          transform: `scale(${scale}) translateX(${liveShift}px)`,
          transitionDuration: `${transitionDur}ms`,
        }}
      >
        {/* Right interior: cash compartment + four card slots */}
        <section className="wallet-half wallet-right leather" aria-label="Wallet pockets" inert={(phone && w.side !== 'right') || undefined}>
          <LeatherTexture />
          <div className="stitch" aria-hidden />
          <div className="cash-well" aria-hidden>
            <LeatherTexture />
          </div>
          <div className="pockets">
            <NavObject id="buy" index={-1} />
            <div className="card-slots-group" inert={!w.open || undefined}>
              {SLOT_ORDER.map((id, i) => (
                <NavObject key={id} id={id} index={i} />
              ))}
              <div className="slot-pocket slot-pocket-base" style={{ top: 112 + 3 * 62 + 50, zIndex: 20 }} aria-hidden>
                <LeatherTexture />
                <span className="pocket-emboss font-display">Your finances stay private.</span>
              </div>
            </div>
          </div>
        </section>

        {/* Left flap: interior (ID pocket) on the front, exterior cover on the back */}
        <div
          className="wallet-flap"
          style={{ transform: `rotateY(${liveRotation}deg)`, transitionDuration: `${transitionDur}ms` }}
        >
          <section className="flap-face flap-inside leather" aria-label="ID pocket" inert={!w.open || (phone && w.side !== 'left') || undefined}>
            <LeatherTexture />
            <div className="stitch" aria-hidden />
            <div className="id-window">
              <IdCard ref={idRef} />
            </div>
            <div className="flap-pocket" aria-hidden>
              <LeatherTexture />
              <span className="pocket-emboss font-display">Est. HackUTD 2026</span>
            </div>
          </section>
          <section className="flap-face flap-outside leather" aria-label="Wallet Whisperer" inert={w.open || undefined}>
            <LeatherTexture />
            <div className="stitch" aria-hidden />
            <div className="cover-content">
              <h1 className="emboss font-display">
                Wallet
                <br />
                Whisperer
              </h1>
              <p className="cover-tag">Can we afford it?</p>
            </div>
          </section>
        </div>
        <div className="wallet-fold" aria-hidden>
          <LeatherTexture />
        </div>

        {/* Subtle semi-transparent edge button to close (left) or open (right) */}
        {!pageOpen && (
          <WalletFoldHandle
            open={w.open}
            onClose={w.closeWallet}
            onOpen={w.openWallet}
            dur={dur}
            disabled={w.loggingOut}
            scale={scale}
            onDragProgress={setDragProgress}
          />
        )}
      </div>
      </div>

      {!w.open && !isDragging && <button ref={startBtn} type="button" className="start-btn inline-flex items-center justify-center gap-3" disabled={w.loggingOut} onClick={start}>Start Saving <span aria-hidden="true">→</span></button>}

      {phone && w.open && !pageOpen && (
        <button type="button" className="side-toggle" onClick={() => w.setSide(w.side === "left" ? "right" : "left")}>
          {w.side === "left" ? "See your cards →" : "← See your ID card"}
        </button>
      )}
    </div>
  );
}

function LeatherTexture() {
  return <img className="leather-texture" src={leatherTexture} alt="" aria-hidden="true" width={1024} height={1024} />;
}

function NavObject({ id, index }: { id: CardId; index: number }) {
  const w = useWallet();
  const out = w.flight?.id === id || w.activeCard === id;
  const isCash = id === "buy";
  const top = isCash ? -38 : 112 + index * 62;
  return (
    <>
      <button
        type="button"
        ref={(el) => w.registerSlot(id, el)}
        className={`nav-object ${isCash ? "is-cash" : "is-card"}`}
        style={{ top, zIndex: isCash ? 1 : 3 + index * 4, visibility: out ? "hidden" : undefined }}
        onClick={() => w.openCard(id)}
        aria-label={`${CARDS[id].title} — ${CARDS[id].hint}`}
      >
        <CardFace id={id} />
      </button>
      {isCash ? (
        <div className="cash-pocket" aria-hidden>
          <LeatherTexture />
        </div>
      ) : (
        <div className="slot-pocket" style={{ top: top + 50, zIndex: 4 + index * 4 }} aria-hidden>
          <LeatherTexture />
        </div>
      )}
    </>
  );
}
