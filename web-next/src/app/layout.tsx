import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RootProviders } from "@/components/providers/root-providers";
import { AppLayout } from "@/components/layout/app-layout";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Nbility";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nbility.dev";
const siteDescription = `${siteName} — 统一 AI API 网关，聚合 OpenAI、Claude、Gemini 等 40+ 主流 AI 提供商，提供统一接口、用量管理与计费服务。`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [
    "AI API",
    "OpenAI",
    "Claude",
    "Gemini",
    "API Gateway",
    "AI 代理",
    "统一接口",
    siteName,
  ],
  authors: [{ name: siteName, url: siteUrl }],
  creator: siteName,
  publisher: siteName,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  applicationName: siteName,
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: siteUrl,
    siteName,
    title: siteName,
    description: siteDescription,
    images: [
      {
        url: "/og",
        width: 1200,
        height: 630,
        alt: siteName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    images: ["/og"],
  },
  alternates: {
    canonical: siteUrl,
    types: {
      "application/rss+xml": `${siteUrl}/feed.xml`,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="antialiased font-sans app-bg" suppressHydrationWarning>
        <RootProviders>
          <AppLayout>{children}</AppLayout>
        </RootProviders>
      </body>
    </html>
  );
}
