'use client';

import { forwardRef } from "react";
import { useMe } from "@/lib/useMe";
import { useWallet } from "./WalletContext";

export const IdCard = forwardRef<HTMLButtonElement>(function IdCard(_, ref) {
  const me = useMe();
  const user = me.status === "in" ? me.user : null;
  const w = useWallet();
  const lifted = w.loginOpen;

  const inner = (
    <>
      <div className="id-head">
        <span className="font-display">Wallet Whisperer</span>
        <span>Member ID</span>
      </div>
      <div className="id-body">
        <div className={`id-photo ${user ? "is-filled" : ""}`} aria-hidden>
          {user ? user.name.charAt(0).toUpperCase() : <span className="id-silhouette" />}
        </div>
        <div className="id-fields">
          {user ? (
            <>
              <span className="id-label">Name</span>
              <span className="id-value font-display">{user.name}</span>
              <span className="id-label">Username</span>
              <span className="id-value">@{user.username}</span>
            </>
          ) : (
            <>
              <span className="id-line" />
              <span className="id-line short" />
              <span className="id-line" />
              <span className="id-login">Log in</span>
            </>
          )}
        </div>
      </div>
    </>
  );

  if (user) {
    return (
      <div className="id-card is-filled" aria-label={`Signed in as ${user.name}, @${user.username}`} role="img">
        {inner}
      </div>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      className={`id-card ${lifted ? "is-lifted" : ""}`}
      onClick={() => w.openLogin()}
      aria-haspopup="dialog"
      aria-label="Log in with your member ID"
    >
      {inner}
    </button>
  );
});
