import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui';
import { NotificationsBridge } from '@/components/AppShell';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Playfair_Display({ subsets: ['latin'], variable: '--font-display', weight: ['600', '700'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Cercle Privé — Poker entre amis', template: '%s · Cercle Privé' },
  description: "Texas Hold'em No-Limit privé entre amis, en temps réel, avec jetons virtuels.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#070b14',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${display.variable}`}>
      <body className="font-sans">
        <ToastProvider>
          <AuthProvider>
            <NotificationsBridge />
            {children}
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
