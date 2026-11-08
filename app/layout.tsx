import type { Metadata } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { WalletApp } from "@/components/wallet/WalletApp";
import "./globals.css";

const manrope = localFont({ src: './fonts/manrope.woff2', variable: '--font-manrope', weight: '400 700', display: 'swap' });
const fraunces = localFont({ src: './fonts/fraunces.woff2', variable: '--font-fraunces', weight: '400 700', display: 'swap' });

export const metadata: Metadata = {
  title: "Wallet Whisperer",
  description: "See your whole financial picture, get a health score that updates itself, and plan big purchases together.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Suspense fallback={<p className="p-8" role="status">Opening your wallet…</p>}>
          <WalletApp>{children}</WalletApp>
        </Suspense>
      </body>
    </html>
  );
}
