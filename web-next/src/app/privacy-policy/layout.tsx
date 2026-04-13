import type { Metadata } from "next";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Nbility";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nbility.dev";

export const metadata: Metadata = {
  title: "隐私政策",
  description: `${siteName} 隐私政策，了解我们如何收集、使用和保护你的个人信息。`,
  alternates: {
    canonical: `${siteUrl}/privacy-policy`,
  },
};

export default function PrivacyPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
