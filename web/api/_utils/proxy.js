const DEFAULT_BACKEND_ORIGIN = 'https://www.aicentos.com';

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

const PUBLIC_CACHE_RULES = [
  { pattern: /^\/api\/status\/?$/, ttl: 30 },
  { pattern: /^\/api\/notice\/?$/, ttl: 60 },
  { pattern: /^\/api\/about\/?$/, ttl: 300 },
  { pattern: /^\/api\/user-agreement\/?$/, ttl: 300 },
  { pattern: /^\/api\/privacy-policy\/?$/, ttl: 300 },
  { pattern: /^\/api\/home_page_content\/?$/, ttl: 300 },
  { pattern: /^\/api\/ratio_config\/?$/, ttl: 300 },
];

function getBackendOrigin() {
  const raw =
    process.env.BACKEND_ORIGIN ||
    process.env.VITE_REACT_APP_BACKEND_ORIGIN ||
    process.env.VITE_REACT_APP_SERVER_URL ||
    DEFAULT_BACKEND_ORIGIN;
  return raw.replace(/\/+$/, '');
}

function buildProxyHeaders(request) {
  const headers = new Headers(request.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => headers.delete(header));
  headers.set('x-forwarded-host', new URL(request.url).host);
  headers.set('x-forwarded-proto', 'https');
  return headers;
}

function getCacheTTL(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return 0;
  }

  const url = new URL(request.url);
  const hasAuth =
    request.headers.has('authorization') ||
    request.headers.has('cookie') ||
    request.headers.has('x-api-key');
  if (hasAuth) {
    return 0;
  }

  const matchedRule = PUBLIC_CACHE_RULES.find((rule) =>
    rule.pattern.test(url.pathname),
  );
  return matchedRule ? matchedRule.ttl : 0;
}

function applyCacheHeaders(headers, ttl) {
  if (!ttl) {
    return;
  }

  const cacheValue = `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * 5}`;
  headers.set('Cache-Control', cacheValue);
  headers.set('CDN-Cache-Control', cacheValue);
  headers.set('Vercel-CDN-Cache-Control', cacheValue);
}

export async function proxyToPath(request, upstreamPath) {
  const backendOrigin = getBackendOrigin();
  if (!backendOrigin) {
    throw new Error('Missing backend origin.');
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = `${backendOrigin}${upstreamPath}${requestUrl.search}`;
  const cacheTTL = getCacheTTL(request);
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
  if (upstreamResponse.ok) {
    applyCacheHeaders(responseHeaders, cacheTTL);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
