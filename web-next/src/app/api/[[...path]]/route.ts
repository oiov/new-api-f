import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.fishxcode.com';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

// Strip from upstream response: body already decompressed by fetch()
const STRIP_RES_HEADERS = new Set([
  ...HOP_BY_HOP,
  'content-encoding',
  'content-length',
]);

/**
 * Follow redirects manually for non-GET methods, preserving the HTTP method.
 *
 * Problem: Gin emits 301 for trailing-slash normalisation.
 * Node.js fetch (undici) with redirect:'follow' converts PUT/POST/DELETE → GET on 301/302.
 * So we use redirect:'manual' and follow redirects ourselves, preserving the method.
 *
 * Key subtlety: when redirect:'manual' is used, the 301 response body is null
 * (opaque redirect).  We must NOT call res.body?.cancel().catch() because
 * `res.body?.cancel()` returns undefined (body is null) and `.catch()` on
 * undefined throws TypeError → handler crashes → connection hangs.
 */
async function fetchPreservingMethod(
  url: string,
  method: string,
  headers: Headers,
  body: ArrayBuffer | undefined,
  maxRedirects = 8,
): Promise<Response> {
  let currentUrl = url;

  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(currentUrl, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: 'manual',
    });

    const location = res.headers.get('location');
    const isRedirect = res.status >= 300 && res.status < 400 && !!location;

    if (!isRedirect || i === maxRedirects) {
      return res;
    }

    // Safely consume/discard the (usually null or tiny) redirect response body
    if (res.body) {
      try { await res.body.cancel(); } catch { /* ignore */ }
    }

    currentUrl = new URL(location, currentUrl).toString();

    // 303 See Other → always switch to GET
    if (res.status === 303) {
      method = 'GET';
      body = undefined;
    }
    // 301/302/307/308 → preserve method + body
  }

  // Fallback (should not be reached)
  return fetch(currentUrl, { method, headers, body: body && body.byteLength > 0 ? body : undefined, redirect: 'follow' });
}

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const url = new URL(request.url);
  const apiPath = path.length > 0 ? path.join('/') : '';
  const targetUrl = `${BACKEND}/api/${apiPath}${url.search}`;

  // Build forwarded headers (strip hop-by-hop + host)
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  const isReadOnly = request.method === 'GET' || request.method === 'HEAD';

  let upstream: Response;

  if (isReadOnly) {
    // GET/HEAD: redirect:'follow' is safe — method stays GET regardless of redirect type
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      redirect: 'follow',
    });
  } else {
    // POST/PUT/PATCH/DELETE: buffer body and follow redirects while preserving method
    const body = await request.arrayBuffer();
    upstream = await fetchPreservingMethod(targetUrl, request.method, headers, body);
  }

  // Build response headers (strip encoding/length — body already decompressed by Node fetch)
  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP_RES_HEADERS.has(key.toLowerCase())) {
      resHeaders.set(key, value);
    }
  });
  // Prevent browser from caching API responses
  resHeaders.set('cache-control', 'no-store');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

async function handler(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<NextResponse> {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const HEAD = handler;
export const OPTIONS = handler;
