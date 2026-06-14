// Cloudflare Snippet —— 挂在 old.nbility.dev/* （不挂 api.nbility.dev / apt.nbility.dev / api.uv.do 等任何 API host）。
// 作用：按访客国家给 HTML 响应种 nb_geo_block cookie；old web 前端读 cookie 决定是否显示地区拦截页。
// 本 Snippet 不做边缘封禁（永不返回 403），只种 cookie + 换前端页面，故不影响任何 API 直连。
// 开关：改下方 ENABLED / COUNTRIES / BYPASS_TOKEN 常量后在 CF 面板保存即可，无需重新 build 旧前端。
const ENABLED = true;
const COUNTRIES = ['CN'];
const BYPASS_TOKEN = 'CHANGE_ME_LONG_RANDOM'; // 与运维笔记一致；逃生口 URL: old.nbility.dev/?geobypass=<此值>
const COOKIE_DOMAIN = '.nbility.dev';
const BYPASS_MAX_AGE = 60 * 60 * 24 * 365; // 1 年

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const country = (request.cf && request.cf.country) || '';
    const cookie = request.headers.get('cookie') || '';
    const hasBypassCookie = cookie
      .split(';')
      .map((p) => p.trim())
      .includes('nb_geo_bypass=1');
    const grantBypass =
      !!BYPASS_TOKEN && url.searchParams.get('geobypass') === BYPASS_TOKEN;
    const bypassed = grantBypass || hasBypassCookie;
    const blocked =
      ENABLED && !bypassed && !!country && COUNTRIES.includes(country);

    const response = await fetch(request);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return response; // 仅对 HTML 文档种 cookie，静态资源不处理
    }

    const next = new Response(response.body, response);
    const base = `Path=/; SameSite=Lax; Domain=${COOKIE_DOMAIN}`;
    next.headers.append(
      'set-cookie',
      `nb_geo_block=${blocked ? '1' : '0'}; ${base}`
    );
    if (country) {
      next.headers.append('set-cookie', `nb_geo=${country}; ${base}`);
    }
    if (grantBypass) {
      next.headers.append(
        'set-cookie',
        `nb_geo_bypass=1; Max-Age=${BYPASS_MAX_AGE}; ${base}`
      );
    }
    return next;
  },
};
