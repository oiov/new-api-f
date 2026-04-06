import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.fishxcode.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/pricing',
          '/docs',
          '/status',
          '/register',
          '/privacy-policy',
          '/user-agreement',
          '/contact',
        ],
        disallow: [
          '/console/',
          '/api/',
          '/oauth/',
          '/reset',
          '/setup',
          '/chat2link',
          '/forbidden',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
