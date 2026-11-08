'use client';

import { useEffect, useState, type CSSProperties } from "react";
import { CardFace } from "./CardFace";
import { MOTION, useWallet } from "./WalletContext";

function pageRect() {
  const vw = window.innerWidth;
  const width = Math.min(1180, vw - 24);
  return { top: 76, left: (vw - width) / 2, width, height: Math.min(260, window.innerHeight - 100) };
}

/** The physical card in motion between its slot and the expanded page header. */
export function FlightLayer() {
  const { flight, reduced } = useWallet();
  const [, force] = useState(0);
  useEffect(() => {
    const r = () => force((n) => n + 1);
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  if (!flight) return null;

  const slot = flight.slot;
  const full = pageRect();
  const at = (r: { top: number; left: number; width: number; height: number }, dy = 0): CSSProperties => ({
    top: r.top + dy,
    left: r.left,
    width: r.width,
    height: r.height,
  });

  let style: CSSProperties = {};
  let ms = 0;
  switch (flight.phase) {
    case "start":
      style = slot ? at(slot) : at(full);
      break;
    case "lift":
      style = slot ? { ...at(slot, -64), transform: "rotate(-1.5deg) scale(1.04)" } : at(full);
      ms = MOTION.lift;
      break;
    case "expand":
      style = { ...at(full), borderRadius: 28 };
      ms = MOTION.expand;
      break;
    case "settle":
      style = { ...at(full), borderRadius: 28, opacity: 0 };
      ms = MOTION.settle;
      break;
    case "full":
      style = { ...at(full), borderRadius: 28 };
      break;
    case "shrink":
      style = slot ? { ...at(slot, -64), transform: "rotate(-1.5deg) scale(1.04)" } : { ...at(full), opacity: 0 };
      ms = MOTION.shrink;
      break;
    case "insert":
      style = slot ? at(slot) : { ...at(full), opacity: 0 };
      ms = MOTION.insert;
      break;
  }
  if (reduced) {
    ms = 150;
    if (flight.phase === "lift" || flight.phase === "shrink") style = { ...style, transform: undefined };
  }

  return (
    <div className="flight-layer" aria-hidden>
      <div
        className={`flight-card ${flight.id === "buy" ? "is-cash" : ""}`}
        data-phase={flight.phase}
        style={{ ...style, transitionDuration: `${ms}ms` }}
      >
        <CardFace id={flight.id} />
      </div>
    </div>
  );
}
