import type { Metadata } from 'next';

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'FishXCode';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.fishxcode.com';

const title = '系统状态';
const description = `查看 ${siteName} 实时系统状态、各 AI 渠道可用性及历史可用率。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/status` },
  openGraph: {
    title: `${title} | ${siteName}`,
    description,
    url: `${siteUrl}/status`,
    images: [
      {
        url: `/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
        width: 1200,
        height: 630,
        alt: `${title} | ${siteName}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${title} | ${siteName}`,
    description,
    images: [`/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`],
  },
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
