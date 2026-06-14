// 读 CF Snippet 种下的 nb_geo_block cookie。纯函数，便于测试。
export const GEO_BLOCK_COOKIE = 'nb_geo_block';

export function isRegionBlockedFromCookie(cookieString) {
  if (!cookieString) return false;
  return cookieString
    .split(';')
    .map((part) => part.trim())
    .some((part) => part === `${GEO_BLOCK_COOKIE}=1`);
}

export function isRegionBlocked() {
  if (typeof document === 'undefined') return false;
  return isRegionBlockedFromCookie(document.cookie);
}
