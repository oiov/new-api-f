import type { Metadata } from 'next';
import { NotFoundContent } from './_not-found-content';

export const metadata: Metadata = {
  title: '页面未找到',
  description: '您访问的页面不存在或已被移除。',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundContent />;
}
