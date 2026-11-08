'use client';

/* eslint-disable @next/next/no-img-element -- Local texture images repeat within the physical wallet and its animation layer. */

import { CARDS, type CardId } from "./cards";
const banknote = "/wallet/wallet-banknote-stylized.jpg";

/** The visual face of a navigation object. Shared by the slot card, the flying card and page headers. */
export function CardFace({ id }: { id: CardId }) {
  const card = CARDS[id];
  if (id === "buy") {
    return (
      <div className={`card-face ${card.face} cash-face`}>
        <div className="cash-paper" aria-hidden="true">
          <span className="cash-half cash-left"><img src={banknote} alt="" width={1536} height={512} /></span>
          <span className="cash-half cash-right"><img src={banknote} alt="" width={1536} height={512} /></span>
          <span className="cash-crease" />
        </div>
      </div>
    );
  }
  if (id === "household") {
    return (
      <div className={`card-face ${card.face}`}>
        <span className="card-title font-display">{card.title}</span>
        <span className="card-brand">HackUTD · 2026</span>
        <span className="card-swoosh" aria-hidden />
        <span className="biz-org">HackUTD 2026 · Wallet Whisperer</span>
        <span className="biz-rule" aria-hidden />
        <span className="biz-line">Members · Sharing by consent</span>
      </div>
    );
  }
  const brand = id === "money" ? { name: "PNC", logo: "/wallet/logos/pnc.svg" }
    : id === "friends" ? { name: "Capital One", logo: "/wallet/logos/capital-one.svg" }
    : { name: "NVIDIA", logo: "/wallet/logos/nvidia.svg" };
  return (
    <div className={`card-face ${card.face}`}>
      <span className="card-title font-display">{card.title}</span>
      <span className="card-brand card-brand-logo">
        {brand.name}
        <span className="brand-chip"><img src={brand.logo} alt="" width={20} height={20} /></span>
      </span>
      <span className="card-chip" aria-hidden />
      <span className="card-number" aria-hidden>•••• •••• •••• 2026</span>
      <span className="card-swoosh" aria-hidden />
    </div>
  );
}
