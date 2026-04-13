import type { Metadata } from "next";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Nbility";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nbility.dev";

const title = "开发文档";
const description = `${siteName} 开发者文档，包含 API 接入指南、参数说明、示例代码，快速接入 OpenAI、Claude、Gemini 等主流 AI 模型。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/docs` },
  openGraph: {
    title: `${title} | ${siteName}`,
    description,
    url: `${siteUrl}/docs`,
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
    card: "summary_large_image",
    title: `${title} | ${siteName}`,
    description,
    images: [
      `/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
    ],
  },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
