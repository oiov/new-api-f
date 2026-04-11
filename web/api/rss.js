import { buildRssXml, fetchSubscriptionPlans } from './_utils/subscription-seo.js';

export const config = {
  runtime: 'edge',
};

export default async function handler() {
  try {
    const plans = await fetchSubscriptionPlans();
    return new Response(buildRssXml(plans), {
      status: 200,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'content-disposition': 'inline; filename=\"rss.xml\"',
        'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800',
      },
    });
  } catch (error) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>FishXCode AI</title><link>https://fishxcode.com/</link><description>订阅动态暂不可用</description><language>zh-CN</language></channel></rss>`,
      {
        status: 200,
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'content-disposition': 'inline; filename=\"rss.xml\"',
          'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
          'x-seo-error': error instanceof Error ? error.message : 'unknown',
        },
      },
    );
  }
}
