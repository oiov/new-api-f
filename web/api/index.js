import { proxyToPath } from './_utils/proxy.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    return await proxyToPath(request, '/api');
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
