import type { Metadata } from 'next';

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'FishXCode';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.fishxcode.com';

export const metadata: Metadata = {
  title: '用户协议',
  description: `${siteName} 用户服务协议，使用本平台前请仔细阅读相关条款。`,
  alternates: {
    canonical: `${siteUrl}/user-agreement`,
  },
};

export default function UserAgreementLayout({ children }: { children: React.ReactNode }) {
  return children;
}
