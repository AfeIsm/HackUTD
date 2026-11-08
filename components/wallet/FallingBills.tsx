'use client';

export function FallingBills() {
  return <div className="falling-bills" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => (
    <div className="falling-bill" key={i}><svg viewBox="0 0 100 44" focusable="false">
      <rect x="1" y="1" width="98" height="42" rx="2" className="bill-paper" />
      <rect x="5" y="5" width="90" height="34" rx="2" className="bill-border" />
      <ellipse cx="50" cy="22" rx="13" ry="15" className="bill-border" />
      <path d="M53 14c-8-4-12 6-3 8s5 11-4 7m4-18v22M13 12h12m-12 5h17m40 10h17m-12 5h12" className="bill-engraving" />
      <circle cx="16" cy="29" r="5" className="bill-border" /><circle cx="84" cy="15" r="5" className="bill-border" />
    </svg></div>
  ))}</div>;
}