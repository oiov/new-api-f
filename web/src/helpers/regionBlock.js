// 地区检测：客户端向 Cloudflare 免费端点 /cdn-cgi/trace 拿访客国家码（loc=）判定是否拦截。
// old.nbility.dev 走 CF 橙云，该端点由边缘直接响应、不回源、免费。无逃生口设计。
//
// 开关与国家码（改这里后重新构建部署 old web 即生效；old 是独立部署，无 wrangler/worker）：
const ENABLED = true;
const COUNTRIES = ['CN', 'HK', 'MO', 'TW']; // 中国大陆，香港，澳门，台湾

export function parseTraceLoc(traceText) {
  const line = (traceText || '')
    .split('\n')
    .find((entry) => entry.startsWith('loc='));
  return line ? line.slice('loc='.length).trim().toUpperCase() : '';
}

export function isCountryBlocked(country, countries) {
  if (!country) return false; // fail-open
  return countries.includes(country.toUpperCase());
}

// 异步：返回 true=拦截。开关关闭/任何异常 → false（fail-open）。
export async function detectRegionBlocked() {
  if (!ENABLED || COUNTRIES.length === 0) return false;
  try {
    const res = await fetch('/cdn-cgi/trace', { cache: 'no-store' });
    if (!res.ok) return false;
    const text = await res.text();
    return isCountryBlocked(parseTraceLoc(text), COUNTRIES);
  } catch {
    return false;
  }
}
