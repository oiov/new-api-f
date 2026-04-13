import type { Metadata } from "next";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Nbility";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nbility.dev";

export const metadata: Metadata = {
  title: "登录",
  description: `登录 ${siteName}，管理你的 AI API 密钥、用量与账户信息。`,
  robots: { index: false, follow: false },
  alternates: {
    canonical: `${siteUrl}/login`,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
