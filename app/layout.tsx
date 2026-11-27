import type { Metadata } from 'next';
import './globals.css';

// Every page renders per request: the CSP nonce (proxy.ts) and the signed-in user are request-specific.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'pawprint-ledger',
  description: 'What a pet really costs in the UK, and whether it fits your life.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
