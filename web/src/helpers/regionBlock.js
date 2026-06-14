// 地区检测：客户端向 Cloudflare 免费端点 /cdn-cgi/trace 拿访客国家码（loc=）判定是否拦截。
// 站点走 CF 橙云时该端点由边缘直接响应、不回源、免费。纯函数便于复用/测试。无逃生口设计。

export function parseCountryList(csv) {
  if (!csv) return [];
  return csv
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
}

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

const ENABLED = import.meta.env.VITE_GEO_BLOCK_ENABLED === 'true';
const COUNTRIES = parseCountryList(
  import.meta.env.VITE_GEO_BLOCK_COUNTRIES || 'CN,HK,MO,TW',
);

// 异步：返回 true=拦截。开关关闭/列表为空/任何异常 → false（fail-open）。
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
