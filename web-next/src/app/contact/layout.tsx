import type { Metadata } from 'next';

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'FishXCode';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.fishxcode.com';

const title = '联系我们';
const description = `联系 ${siteName} 团队，获取技术支持、商务合作或其他咨询服务。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/contact` },
  openGraph: {
    title: `${title} | ${siteName}`,
    description,
    url: `${siteUrl}/contact`,
    images: [
      {
        url: `/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
        width: 1200,
        height: 630,
        alt: `${title} | ${siteName}`,
      },
    ],
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
