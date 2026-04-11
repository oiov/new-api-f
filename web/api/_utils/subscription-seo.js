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

export const PUBLIC_SITE_ENTRIES = [
  {
    path: '/',
    changefreq: 'daily',
    priority: '1.0',
    title: 'FishXCode AI 首页 / Home',
    description:
      '企业级 Claude API 官方通道中转，支持包月套餐、企业采购和常用模型接入。 / Enterprise Claude API gateway with subscriptions, enterprise purchasing, and common model access.',
    includeInRss: true,
  },
  {
    path: '/pricing?tab=subscription-plans',
    changefreq: 'daily',
    priority: '0.95',
    title: 'FishXCode AI 订阅套餐列表 / Subscription Plans',
    description:
      '查看当前可售订阅套餐、价格更新和套餐分组。 / Explore current subscription plans, pricing updates, and series groupings.',
    includeInRss: true,
  },
  {
    path: '/pricing',
    changefreq: 'weekly',
    priority: '0.9',
    title: '价格方案 / Pricing',
    description:
      '查看模型价格与订阅套餐价格，支持公开访问和在线购买。 / Compare model pricing and subscription pricing with public access and online purchase.',
    includeInRss: true,
  },
  {
    path: '/docs',
    changefreq: 'weekly',
    priority: '0.8',
    title: '开发文档 / Docs',
    description:
      '阅读 Claude 接入文档、使用说明与配置指南。 / Read Claude integration docs, usage notes, and setup guides.',
    includeInRss: true,
  },
  {
    path: '/status',
    changefreq: 'hourly',
    priority: '0.7',
    title: '系统状态 / Status',
    description:
      '查看当前服务状态、公告和站点说明。 / Check service status, announcements, and site information.',
    includeInRss: true,
  },
  {
    path: '/register',
    changefreq: 'monthly',
    priority: '0.6',
    title: '注册账号 / Register',
    description:
      '注册 FishXCode AI 账号并开始使用公开订阅服务。 / Register a FishXCode AI account and start using public subscription services.',
  },
  {
    path: '/contact',
    changefreq: 'monthly',
    priority: '0.5',
    title: '联系我们 / Contact',
    description:
      '联系官方客服渠道，咨询售前、采购和售后问题。 / Contact official support for presales, purchasing, and after-sales questions.',
    includeInRss: true,
  },
  {
    path: '/privacy-policy',
    changefreq: 'yearly',
    priority: '0.3',
    title: '隐私政策 / Privacy Policy',
    description:
      '查看账号、订阅与访问过程中的数据收集和保护说明。 / Review data collection and protection details for accounts, subscriptions, and access.',
  },
  {
    path: '/user-agreement',
    changefreq: 'yearly',
    priority: '0.3',
    title: '用户协议 / Terms',
    description:
      '查看订阅服务、支付和平台规则。 / Review subscription, payment, and platform rules.',
  },
];

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

function toAbsoluteUrl(path) {
  return `${SITE_URL}${path}`;
}

function getPlanDescription(plan) {
  if (plan?.subtitle) return plan.subtitle;
  const models = uniqueValues(plan?.allowed_models, 3);
  const vendors = uniqueValues(plan?.allowed_vendor_names, 2);
  const modelText = models.length > 0 ? models.join(' / ') : '多模型';
  const vendorText = vendors.length > 0 ? vendors.join(' / ') : '兼容供应商';
  return `${plan?.title || '订阅套餐'}，支持 ${modelText}，适用于 ${vendorText}，支持在线购买。 / ${
    plan?.title || 'Subscription plan'
  } supports ${modelText}, works for ${vendorText}, and can be purchased online.`;
}

function getLatestPlanLastModified(plans = []) {
  const dates = plans.map((plan) => getPlanLastModified(plan).getTime()).filter(Boolean);
  if (dates.length === 0) {
    return new Date();
  }
  return new Date(Math.max(...dates));
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
  const latestPlanLastmod = getLatestPlanLastModified(plans).toISOString();
  const staticEntries = PUBLIC_SITE_ENTRIES.map((entry) => ({
    loc: toAbsoluteUrl(entry.path),
    changefreq: entry.changefreq,
    priority: entry.priority,
    lastmod:
      entry.path.startsWith('/pricing') || entry.path === '/'
        ? latestPlanLastmod
        : now,
  }));

  const planEntries = plans.map((plan) => ({
    loc: toAbsoluteUrl(getPlanPath(plan.id)),
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
  const latestPlanDate = getLatestPlanLastModified(plans).toUTCString();
  const listDescription = `当前可售 ${plans.length} 个订阅套餐，覆盖 ${uniqueValues(plans.map((plan) => inferPlanSeries(plan)), 4).join('、') || 'Claude、Codex'} 等系列。 / ${plans.length} active subscription plans are currently available, covering ${uniqueValues(plans.map((plan) => inferPlanSeries(plan)), 4).join(', ') || 'Claude, Codex'} series.`;
  const staticItems = PUBLIC_SITE_ENTRIES.filter((entry) => entry.includeInRss).map(
    (entry) => `
    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${toAbsoluteUrl(entry.path)}</link>
      <guid>${toAbsoluteUrl(entry.path)}</guid>
      <pubDate>${entry.path.startsWith('/pricing') || entry.path === '/' ? latestPlanDate : now}</pubDate>
      <description><![CDATA[${entry.path === '/pricing?tab=subscription-plans' ? listDescription : entry.description}]]></description>
    </item>`,
  );

  const planItems = plans.slice(0, 20).map((plan) => {
    const title = `${plan?.title || `套餐 #${plan?.id}`}`;
    const link = toAbsoluteUrl(getPlanPath(plan.id));
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
    <description>FishXCode AI 订阅套餐、价格更新与可售方案动态。 / FishXCode AI subscription plans, pricing updates, and availability feed.</description>
    <language>zh-CN</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>300</ttl>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/logo.png</url>
      <title>FishXCode AI</title>
      <link>${SITE_URL}/</link>
    </image>${staticItems.join('')}${planItems.join('')}
  </channel>
</rss>`;
}

export function buildRobotsTxt() {
  return `# FishXCode public site crawler rules / 公网站点爬虫规则
User-agent: *
Allow: /
Disallow: /console/
Disallow: /api/
Disallow: /oauth/
Disallow: /login
Disallow: /reset
Disallow: /user/reset
Disallow: /setup
Disallow: /chat2link
Disallow: /forbidden

Host: ${SITE_URL}
Sitemap: ${SITE_URL}/sitemap.xml
# RSS Feed / 订阅源: ${SITE_URL}/rss.xml
`;
}
