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

function getBackendOrigin(env) {
  const raw = env.BACKEND_ORIGIN || env.VITE_REACT_APP_SERVER_URL || '';
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

export async function proxyRequest(context, basePath) {
  const backendOrigin = getBackendOrigin(context.env);
  if (!backendOrigin) {
    return new Response(
      JSON.stringify({
        success: false,
        message:
          'Missing BACKEND_ORIGIN. Keep VITE_REACT_APP_SERVER_URL empty when using platform proxy.',
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

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
