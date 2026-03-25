import { proxyToPath } from './_utils/proxy.js';

export const config = {
  runtime: 'edge',
};

function buildUpstreamPath(request) {
  const requestUrl = new URL(request.url);
  const tailPath = requestUrl.pathname.replace(/^\/api\/?/, '');
  if (!tailPath) {
    return '/api';
  }
  const hasTrailingSlash = requestUrl.pathname.endsWith('/');
  return `/api/${tailPath}${hasTrailingSlash && !tailPath.endsWith('/') ? '/' : ''}`;
}

export default async function handler(request) {
  try {
    return await proxyToPath(request, buildUpstreamPath(request));
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Proxy error',
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      },
    );
  }
}
