/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

const DEFAULT_BACKEND_ORIGIN = 'https://claud.fishxcode.com';

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

function getBackendOrigin(env) {
  const raw =
    env.BACKEND_ORIGIN ||
    env.VITE_REACT_APP_SERVER_URL ||
    DEFAULT_BACKEND_ORIGIN;
  return raw.replace(/\/+$/, '');
}

function getTailPath(params) {
  if (!params) return '';
  if (Array.isArray(params.path)) {
    return params.path.filter(Boolean).join('/');
  }
  if (typeof params.path === 'string') {
    return params.path;
  }
  return '';
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
}

export async function proxyRequest(context, basePath) {
  const backendOrigin = getBackendOrigin(context.env);
  if (!backendOrigin) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Missing backend origin.',
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

  const requestUrl = new URL(context.request.url);
  const cacheTTL = getCacheTTL(context.request);
  const tailPath = getTailPath(context.params);
  const upstreamPath = tailPath ? `${basePath}/${tailPath}` : basePath;
  const upstreamUrl = `${backendOrigin}${upstreamPath}${requestUrl.search}`;

  const headers = new Headers(context.request.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => headers.delete(header));
  headers.set('x-forwarded-host', requestUrl.host);
  headers.set('x-forwarded-proto', requestUrl.protocol.replace(':', ''));

  const init = {
    method: context.request.method,
    headers,
    redirect: 'manual',
  };

  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    init.body = context.request.body;
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
