import { buildRobotsTxt } from './_utils/subscription-seo.js';

export const config = {
  runtime: 'edge',
};

export default async function handler() {
  return new Response(buildRobotsTxt(), {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': 'inline; filename=\"robots.txt\"',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800',
    },
  });
}
