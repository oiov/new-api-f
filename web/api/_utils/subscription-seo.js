const SITE_URL = (
  process.env.VITE_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://fishxcode.com'
).replace(/\/$/, '');

const API_BASE_URL = (
  process.env.BACKEND_API_ORIGIN ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.fishxcode.com'
).replace(/\/$/, '');

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizePlan(item) {
  return item?.plan || item || null;
}

function inferPlanSeries(plan) {
  const text = [
    plan?.title,
    plan?.subtitle,
    plan?.upgrade_group,
    ...(Array.isArray(plan?.allowed_groups) ? plan.allowed_groups : []),
    ...(Array.isArray(plan?.allowed_models) ? plan.allowed_models : []),
    ...(Array.isArray(plan?.allowed_vendor_names) ? plan.allowed_vendor_names : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const isClaude =
    text.includes('claude') || text.includes('anthropic') || text.includes('cc-');
  const isCodex =
    text.includes('codex') ||
    text.includes('openai') ||
    text.includes('gpt') ||
    text.includes('o4');

  if (isClaude && !isCodex) return 'Claude';
  if (isCodex && !isClaude) return 'Codex';
  if (isClaude && isCodex) return 'Claude + Codex';
  return 'AI';
}

function uniqueValues(values = [], limit = 8) {
  return Array.from(new Set((values || []).filter(Boolean))).slice(0, limit);
}

function toDate(value) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && numeric > 0) {
    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPlanLastModified(plan) {
  return (
    toDate(plan?.updated_at) ||
    toDate(plan?.updatedAt) ||
    toDate(plan?.created_at) ||
    toDate(plan?.createdAt) ||
    new Date()
  );
}

function getPlanPath(planId) {
  return `/pricing/subscription-plans/${planId}`;
}

function getPlanDescription(plan) {
  if (plan?.subtitle) return plan.subtitle;
  const models = uniqueValues(plan?.allowed_models, 3);
  const vendors = uniqueValues(plan?.allowed_vendor_names, 2);
  const modelText = models.length > 0 ? models.join(' / ') : '多模型';
  const vendorText = vendors.length > 0 ? vendors.join(' / ') : '兼容供应商';
  return `${plan?.title || '订阅套餐'}，支持 ${modelText}，适用于 ${vendorText}，支持在线购买。`;
}

export async function fetchSubscriptionPlans() {
  const response = await fetch(`${API_BASE_URL}/api/subscription/plans`, {
    headers: {
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch subscription plans: ${response.status}`);
  }
  const payload = await response.json();
  const items = Array.isArray(payload?.data) ? payload.data : [];
  return items
    .map(normalizePlan)
    .filter((plan) => plan?.id && plan?.enabled !== false)
    .sort((a, b) => {
      const timeDiff = getPlanLastModified(b).getTime() - getPlanLastModified(a).getTime();
      if (timeDiff !== 0) return timeDiff;
      return Number(b?.sort_order || 0) - Number(a?.sort_order || 0);
    });
}

export function buildSitemapXml(plans = []) {
  const now = new Date().toISOString();
  const staticEntries = [
    { loc: `${SITE_URL}/`, changefreq: 'daily', priority: '1.0', lastmod: now },
    {
      loc: `${SITE_URL}/pricing?tab=subscription-plans`,
      changefreq: 'daily',
      priority: '0.9',
      lastmod: now,
    },
    { loc: `${SITE_URL}/pricing`, changefreq: 'weekly', priority: '0.9', lastmod: now },
    { loc: `${SITE_URL}/docs`, changefreq: 'weekly', priority: '0.8', lastmod: now },
    { loc: `${SITE_URL}/status`, changefreq: 'hourly', priority: '0.7', lastmod: now },
    { loc: `${SITE_URL}/register`, changefreq: 'monthly', priority: '0.6', lastmod: now },
    { loc: `${SITE_URL}/contact`, changefreq: 'monthly', priority: '0.5', lastmod: now },
    {
      loc: `${SITE_URL}/privacy-policy`,
      changefreq: 'yearly',
      priority: '0.3',
      lastmod: now,
    },
    {
      loc: `${SITE_URL}/user-agreement`,
      changefreq: 'yearly',
      priority: '0.3',
      lastmod: now,
    },
  ];

  const planEntries = plans.map((plan) => ({
    loc: `${SITE_URL}${getPlanPath(plan.id)}`,
    changefreq: 'daily',
    priority: '0.8',
    lastmod: getPlanLastModified(plan).toISOString(),
  }));

  const items = [...staticEntries, ...planEntries]
    .map(
      (item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
}

export function buildRssXml(plans = []) {
  const now = new Date().toUTCString();
  const listDescription = `当前可售 ${plans.length} 个订阅套餐，覆盖 ${uniqueValues(plans.map((plan) => inferPlanSeries(plan)), 4).join('、') || 'Claude、Codex'} 等系列。`;

  const listItem = `
    <item>
      <title>${escapeXml('FishXCode AI 订阅套餐列表')}</title>
      <link>${SITE_URL}/pricing?tab=subscription-plans</link>
      <guid>${SITE_URL}/pricing?tab=subscription-plans</guid>
      <pubDate>${now}</pubDate>
      <description><![CDATA[${listDescription}]]></description>
    </item>`;

  const planItems = plans.slice(0, 20).map((plan) => {
    const title = `${plan?.title || `套餐 #${plan?.id}`}`;
    const link = `${SITE_URL}${getPlanPath(plan.id)}`;
    return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${getPlanLastModified(plan).toUTCString()}</pubDate>
      <description><![CDATA[${getPlanDescription(plan)}]]></description>
      <category>${escapeXml(inferPlanSeries(plan))}</category>
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>FishXCode AI</title>
    <link>${SITE_URL}/</link>
    <description>FishXCode AI 订阅套餐、价格更新与可售方案动态。</description>
    <language>zh-CN</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>300</ttl>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/logo.png</url>
      <title>FishXCode AI</title>
      <link>${SITE_URL}/</link>
    </image>${listItem}${planItems.join('')}
  </channel>
</rss>`;
}
