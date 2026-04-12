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

const DEFAULT_BACKEND_ORIGIN = 'https://www.fishxcode.com';

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
  { pattern: /^\/api\/pricing\/?$/, ttl: 30 },
  { pattern: /^\/api\/subscription\/plans\/?$/, ttl: 30 },
  { pattern: /^\/api\/notice\/?$/, ttl: 60 },
  { pattern: /^\/api\/about\/?$/, ttl: 300 },
  { pattern: /^\/api\/user-agreement\/?$/, ttl: 300 },
  { pattern: /^\/api\/privacy-policy\/?$/, ttl: 300 },
  { pattern: /^\/api\/home_page_content\/?$/, ttl: 300 },
  { pattern: /^\/api\/ratio_config\/?$/, ttl: 300 },
];

const ANTI_DISTRIBUTION_CACHE_TTL = 30 * 1000;

let antiDistributionCache = {
  expiresAt: 0,
  data: null,
};

function getBackendOrigin(env) {
  const raw =
    env.BACKEND_ORIGIN ||
    env.VITE_REACT_APP_BACKEND_ORIGIN ||
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

function normalizeHost(raw) {
  if (!raw) {
    return '';
  }
  try {
    if (raw.includes('://')) {
      return new URL(raw).hostname.toLowerCase();
    }
  } catch {
    return '';
  }
  return raw
    .trim()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/:\d+$/, '')
    .toLowerCase();
}

function hostMatchesPattern(host, pattern) {
  const normalizedHost = normalizeHost(host);
  const normalizedPattern = normalizeHost(pattern);
  if (!normalizedHost || !normalizedPattern) {
    return false;
  }
  if (normalizedHost === normalizedPattern) {
    return true;
  }
  if (normalizedPattern.startsWith('*.')) {
    return normalizedHost.endsWith(normalizedPattern.slice(1));
  }
  return false;
}

function hostMatchesAny(host, patterns = []) {
  return patterns.some((pattern) => hostMatchesPattern(host, pattern));
}

function extractHeaderHost(value) {
  if (!value) {
    return '';
  }
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return '';
  }
}

async function getAntiDistributionConfig(backendOrigin) {
  const now = Date.now();
  if (antiDistributionCache.data && antiDistributionCache.expiresAt > now) {
    return antiDistributionCache.data;
  }

  try {
    const response = await fetch(`${backendOrigin}/api/anti_distribution/public`, {
      headers: {
        accept: 'application/json',
      },
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    const data = payload?.data || null;
    antiDistributionCache = {
      data,
      expiresAt: now + ANTI_DISTRIBUTION_CACHE_TTL,
    };
    return data;
  } catch {
    return null;
  }
}

function evaluateAntiDistribution(request, config) {
  const requestUrl = new URL(request.url);
  const requestHost = normalizeHost(requestUrl.hostname);
  const originHost = extractHeaderHost(request.headers.get('origin'));
  const refererHost = extractHeaderHost(request.headers.get('referer'));
  const allowedHosts = config?.allowed_hosts || [];
  const allowedSources = config?.allowed_sources || [];

  if (!hostMatchesAny(requestHost, allowedHosts)) {
    return {
      action: config?.log_only ? 'observe' : 'block',
      reason: 'request_host_not_allowed',
      detail: '请求 Host 不在白名单',
    };
  }
  if (originHost && !hostMatchesAny(originHost, allowedSources)) {
    return {
      action: config?.log_only ? 'observe' : 'block',
      reason: 'origin_host_not_allowed',
      detail: 'Origin 不在白名单',
    };
  }
  if (refererHost && !hostMatchesAny(refererHost, allowedSources)) {
    return {
      action: config?.log_only ? 'observe' : 'block',
      reason: 'referer_host_not_allowed',
      detail: 'Referer 不在白名单',
    };
  }
  return {
    action: 'allow',
    reason: '',
    detail: '',
  };
}

function buildBlockedResponse(request, config, decision) {
  const message = `${(config?.blocked_message || '请勿使用反代等程序，请使用 https://fishxcode.com 中转站，如需外接请联系。').trim()} 原因：${decision.detail}`;
  const pathname = new URL(request.url).pathname;
  const headers = {
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-expose-headers': '*',
    'x-anti-distribution-layer': 'web',
    'x-anti-distribution-action': 'block',
    'x-anti-distribution-reason': decision.reason,
  };
  if (/^\/api\//.test(pathname)) {
    return new Response(
      JSON.stringify({
        success: false,
        message,
        reason: decision.reason,
      }),
      {
        status: 403,
        headers: {
          ...headers,
          'content-type': 'application/json; charset=utf-8',
        },
      },
    );
  }
  if (
    /^\/v1\//.test(pathname) ||
    /^\/v1beta\//.test(pathname) ||
    /^\/mj\//.test(pathname) ||
    /^\/pg\//.test(pathname) ||
    /^\/suno\//.test(pathname) ||
    /^\/kling\//.test(pathname) ||
    /^\/jimeng/.test(pathname)
  ) {
    return new Response(
      JSON.stringify({
        error: {
          message,
          type: 'new_api_error',
        },
      }),
      {
        status: 403,
        headers: {
          ...headers,
          'content-type': 'application/json; charset=utf-8',
        },
      },
    );
  }
  return new Response(message, {
    status: 403,
    headers: {
      ...headers,
      'content-type': 'text/plain; charset=utf-8',
    },
  });
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

  const antiDistributionConfig = await getAntiDistributionConfig(backendOrigin);
  if (antiDistributionConfig?.enabled) {
    const decision = evaluateAntiDistribution(
      context.request,
      antiDistributionConfig,
    );
    if (decision.action === 'block') {
      return buildBlockedResponse(
        context.request,
        antiDistributionConfig,
        decision,
      );
    }
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
