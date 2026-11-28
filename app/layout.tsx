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
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
