import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'aaIaaS.ai - Automation & AI as a Service',
  description: 'Enterprise-grade AI-as-a-Service platform with comprehensive automation, multi-tenancy, and developer-first API.',
  keywords: ['AI', 'automation', 'API', 'SaaS', 'machine learning', 'LLM'],
  authors: [{ name: 'aaIaaS.ai' }],
  openGraph: {
    title: 'aaIaaS.ai - Automation & AI as a Service',
    description: 'Enterprise-grade AI-as-a-Service platform',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(inter.className, 'min-h-screen bg-background antialiased')}>
        {children}
      </body>
    </html>
  );
}
