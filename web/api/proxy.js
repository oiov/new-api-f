import { rewriteRateLimitResponse } from './_utils/rate-limit-response';

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

const DEFAULT_BACKEND_ORIGIN = 'https://www.aicentos.com';

const ALLOWED_BASES = new Set(['api', 'v1', 'v1beta', 'mj', 'pg']);

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
    throw new Error('Missing backend origin.');
  }

  const hasTrailingSlash = proxyPath.endsWith('/');
  const normalizedPath = proxyPath.split('/').filter(Boolean).join('/');
  const pathname = normalizedPath
    ? `/${base}/${normalizedPath}${hasTrailingSlash ? '/' : ''}`
    : `/${base}`;
  return `${backendOrigin}${pathname}${url.search}`;
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

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    const cacheTTL = getCacheTTL(request);
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
    const rewrittenResponse = await rewriteRateLimitResponse(upstreamResponse);
    if (rewrittenResponse) {
      return rewrittenResponse;
    }

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
