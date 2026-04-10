import { buildSitemapXml, fetchSubscriptionPlans } from './_utils/subscription-seo.js';

export const config = {
  runtime: 'edge',
};

export default async function handler() {
  try {
    const plans = await fetchSubscriptionPlans();
    return new Response(buildSitemapXml(plans), {
      status: 200,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800',
      },
    });
  } catch (error) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      {
        status: 200,
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
          'x-seo-error': error instanceof Error ? error.message : 'unknown',
        },
      },
    );
  }
}
