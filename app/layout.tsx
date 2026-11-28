import type { Metadata } from 'next';
import './globals.css';

// Every page renders per request: the CSP nonce (proxy.ts) and the signed-in user are request-specific.
export const dynamic = 'force-dynamic';

const title = 'UK pet cost calculator: upfront, monthly and lifetime costs';
const description = 'Compare what a cat, dog, rabbit or other pet costs in the UK, check it fits your home and working hours, find vets nearby and print a landlord pet resume.';

export const metadata: Metadata = {
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title,
  description,
  openGraph: { title, description, type: 'website', locale: 'en_GB', siteName: 'pawprint-ledger' },
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
