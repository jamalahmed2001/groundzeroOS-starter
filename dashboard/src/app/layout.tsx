import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GroundZeroOS',
  description: 'Vault-native agent orchestration dashboard',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ height: '100dvh', overflow: 'hidden' }}>{children}</body>
    </html>
  );
}
