import type { Metadata } from 'next';

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'FishXCode';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.fishxcode.com';

const title = '价格方案';
const description = `查看 ${siteName} 的价格方案，按需选择适合你的 AI API 套餐，灵活计费、透明定价。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/pricing` },
  openGraph: {
    title: `${title} | ${siteName}`,
    description,
    url: `${siteUrl}/pricing`,
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

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
