const DEFAULT_BACKEND_ORIGIN = 'https://claud.fishxcode.com';

const ALLOWED_BASES = new Set(['api', 'v1', 'mj', 'pg']);

const HOP_BY_HOP_HEADERS = [
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

function getBackendOrigin() {
  const raw =
    process.env.BACKEND_ORIGIN ||
    process.env.VITE_REACT_APP_SERVER_URL ||
    DEFAULT_BACKEND_ORIGIN;
  return raw.replace(/\/+$/, '');
}

function buildUpstreamUrl(requestUrl) {
  const url = new URL(requestUrl);
  const base = url.searchParams.get('__proxy_base') || '';
  const proxyPath = url.searchParams.get('__proxy_path') || '';

  if (!ALLOWED_BASES.has(base)) {
    return null;
  }

  url.searchParams.delete('__proxy_base');
  url.searchParams.delete('__proxy_path');

  const backendOrigin = getBackendOrigin();
  if (!backendOrigin) {
    throw new Error(
      'Missing backend origin.',
    );
  }

  const normalizedPath = proxyPath
    .split('/')
    .filter(Boolean)
    .join('/');
  const pathname = normalizedPath ? `/${base}/${normalizedPath}` : `/${base}`;
  return `${backendOrigin}${pathname}${url.search}`;
}

function buildProxyHeaders(request) {
  const headers = new Headers(request.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => headers.delete(header));
  headers.set('x-forwarded-host', new URL(request.url).host);
  headers.set('x-forwarded-proto', 'https');
  return headers;
}

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    const upstreamUrl = buildUpstreamUrl(request.url);
    if (!upstreamUrl) {
      return new Response('Unsupported proxy base', { status: 400 });
    }

    const init = {
      method: request.method,
      headers: buildProxyHeaders(request),
      redirect: 'manual',
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const upstreamResponse = await fetch(upstreamUrl, init);
    const responseHeaders = new Headers(upstreamResponse.headers);
    HOP_BY_HOP_HEADERS.forEach((header) => responseHeaders.delete(header));

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
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
