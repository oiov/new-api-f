const HOP_BY_HOP_HEADERS = [
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

async function readErrorPayload(response) {
  try {
    const text = (await response.text()).trim();
    if (!text) {
      return {
        message: 'Upstream rate limit exceeded',
        error: {},
      };
    }

    try {
      const payload = JSON.parse(text);
      const upstreamError =
        payload && typeof payload.error === 'object' && payload.error
          ? payload.error
          : {};
      if (typeof payload?.detail === 'string' && payload.detail.trim()) {
        return {
          message: payload.detail.trim(),
          error: upstreamError,
        };
      }
      if (
        typeof payload?.error?.message === 'string' &&
        payload.error.message.trim()
      ) {
        return {
          message: payload.error.message.trim(),
          error: upstreamError,
        };
      }
      return {
        message: text,
        error: upstreamError,
      };
    } catch {}

    return {
      message: text,
      error: {},
    };
  } catch {
    return {
      message: 'Upstream rate limit exceeded',
      error: {},
    };
  }
}

function buildJsonRateLimitResponse(response, payload) {
  const headers = new Headers(response.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => headers.delete(header));
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');

  return new Response(
    JSON.stringify({
      type: 'error',
      error: {
        ...payload.error,
        type: 'rate_limit_error',
        message: payload.message,
      },
    }),
    {
      status: 429,
      headers,
    },
  );
}

export async function rewriteRateLimitResponse(response) {
  if (response.status !== 429) {
    return null;
  }

  const payload = await readErrorPayload(response);
  return buildJsonRateLimitResponse(response, payload);
}
