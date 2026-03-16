import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Fed Minutes Chat | 1967-1973',
  description:
    'Explore Federal Reserve meeting minutes from 1967-1973 using AI-powered semantic search. Ask questions about the Nixon Shock, Bretton Woods collapse, and Fed policy decisions.',
  openGraph: {
    title: 'Fed Minutes Chat — AI Search, Fed Board of Governors (1967-1973)',
    description:
      'Semantic search over 30,000 pages of never-before-public Fed Board of Governors minutes (1967-1973). Explore the Nixon Shock, Bretton Woods, and more.',
    type: 'website',
    url: 'https://fedmin-chat.vercel.app',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fed Minutes Chat — AI Search, Fed Board of Governors (1967-1973)',
    description:
      'Semantic search over 30,000 pages of never-before-public Fed Board of Governors minutes (1967-1973). Explore the Nixon Shock, Bretton Woods, and more.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-900 text-slate-100`}
      >
        {children}
      </body>
    </html>
  );
}
