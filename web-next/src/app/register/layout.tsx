import type { Metadata } from 'next';

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'FishXCode';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.fishxcode.com';

const title = '免费注册';
const description = `免费注册 ${siteName}，立即获取 AI API 访问权限，支持 OpenAI、Claude、Gemini 等主流模型。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/register` },
  openGraph: {
    title: `${title} | ${siteName}`,
    description,
    url: `${siteUrl}/register`,
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

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
