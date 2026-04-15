import enLocale from '../i18n/locales/en.json';
import frLocale from '../i18n/locales/fr.json';
import jaLocale from '../i18n/locales/ja.json';
import ruLocale from '../i18n/locales/ru.json';
import viLocale from '../i18n/locales/vi.json';
import zhCNLocale from '../i18n/locales/zh-CN.json';
import zhTWLocale from '../i18n/locales/zh-TW.json';
import { normalizeLanguage } from '../i18n/language';

const SITE_URL = (
  import.meta.env.VITE_PUBLIC_SITE_URL || 'https://nbility.dev'
).replace(/\/$/, '');
const SITE_NAME = 'Nbility AI';
const SEO_LOCALES = {
  en: enLocale.translation,
  fr: frLocale.translation,
  ja: jaLocale.translation,
  ru: ruLocale.translation,
  vi: viLocale.translation,
  'zh-CN': zhCNLocale.translation,
  'zh-TW': zhTWLocale.translation,
};

function getDefaultImage(language) {
  return `${SITE_URL}/logo.svg`;
}

function isChineseLanguage(language) {
  return language?.startsWith('zh');
}

function getSeoTranslations(language) {
  const normalizedLanguage = normalizeLanguage(language) || 'zh-CN';
  return SEO_LOCALES[normalizedLanguage] || SEO_LOCALES['zh-CN'];
}

function getSeoMessage(language, key, vars = {}) {
  const normalizedLanguage = normalizeLanguage(language) || 'zh-CN';
  const primaryTranslations = SEO_LOCALES[normalizedLanguage];
  const englishTemplate = SEO_LOCALES.en?.[key];
  const chineseTemplate = SEO_LOCALES['zh-CN']?.[key];
  let template = primaryTranslations?.[key];

  if (!template) {
    const shouldUseBilingualFallback =
      normalizedLanguage !== 'zh-CN' &&
      normalizedLanguage !== 'zh-TW' &&
      normalizedLanguage !== 'en' &&
      englishTemplate &&
      chineseTemplate;

    if (shouldUseBilingualFallback) {
      template = `${englishTemplate} / ${chineseTemplate}`;
    } else {
      template = englishTemplate || chineseTemplate || key;
    }
  }

  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    const value = vars[name];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function getSeoLocale(language) {
  const normalizedLanguage = normalizeLanguage(language) || 'zh-CN';
  const localeMap = {
    en: 'en_US',
    fr: 'fr_FR',
    ja: 'ja_JP',
    ru: 'ru_RU',
    vi: 'vi_VN',
    'zh-CN': 'zh_CN',
    'zh-TW': 'zh_TW',
  };
  return localeMap[normalizedLanguage] || 'en_US';
}

function withSiteName(title) {
  if (!title) {
    return SITE_NAME;
  }
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
}

function joinSeoList(language, values = [], fallback = '') {
  const items = (values || []).filter(Boolean);
  if (items.length === 0) {
    return fallback;
  }
  return items.join(isChineseLanguage(language) ? '、' : ', ');
}

function buildSeoPayload({
  language,
  path,
  titleZh,
  titleEn,
  descriptionZh,
  descriptionEn,
  keywordsZh,
  keywordsEn,
  robots,
  jsonLd,
}) {
  const zh = isChineseLanguage(language);
  return {
    title: zh ? titleZh : titleEn,
    description: zh ? descriptionZh : descriptionEn,
    keywords: zh ? keywordsZh : keywordsEn,
    canonicalPath: path,
    locale: getSeoLocale(language),
    robots,
    image: getDefaultImage(language),
    jsonLd,
  };
}

function buildLocalizedSeoPayload({
  language,
  path,
  titleKey,
  titleVars,
  descriptionKey,
  descriptionVars,
  keywordsKey,
  keywordsVars,
  robots,
  jsonLd,
}) {
  return {
    title: withSiteName(getSeoMessage(language, titleKey, titleVars)),
    description: getSeoMessage(language, descriptionKey, descriptionVars),
    keywords: keywordsKey
      ? getSeoMessage(language, keywordsKey, keywordsVars)
      : undefined,
    canonicalPath: path,
    locale: getSeoLocale(language),
    robots,
    image: getDefaultImage(language),
    jsonLd,
  };
}

export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.svg`,
    image: `${SITE_URL}/logo.svg`,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        availableLanguage: ['zh-CN', 'en-US'],
        url: `${SITE_URL}/contact`,
      },
    ],
    sameAs: ['https://qm.qq.com/q/XTxYUh2vOC'],
  };
}

export function buildWebsiteJsonLd(language) {
  const zh = isChineseLanguage(language);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: zh ? 'zh-CN' : 'en-US',
    description: zh
      ? 'Nbility AI 提供企业级 Claude API 官方通道中转服务，支持套餐制与企业采购，并兼容 GPT、Gemini 等常用模型。'
      : 'Nbility AI provides an enterprise Claude API gateway through official Anthropic channels, with subscription plans, enterprise purchasing support, and compatibility with common models such as GPT and Gemini.',
  };
}

export function buildServiceJsonLd(language) {
  const zh = isChineseLanguage(language);
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Enterprise Claude API Gateway Service',
    name: zh
      ? '企业级 Claude API 官方通道中转服务'
      : 'Enterprise Claude API gateway service',
    provider: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    areaServed: 'Worldwide',
    audience: {
      '@type': 'Audience',
      audienceType: zh
        ? '企业团队、开发者与专业用户'
        : 'Teams, developers, and professional users',
    },
    url: SITE_URL,
    image: getDefaultImage(language),
    description: zh
      ? '仅接 Anthropic 官方通道，不走逆向，支持包月套餐、企业采购与增值税发票，并兼容 GPT、Gemini 等常用模型。'
      : 'Official Anthropic-only Claude API gateway with monthly subscription plans, enterprise purchasing support, VAT invoices, and compatibility with common models such as GPT and Gemini.',
  };
}

export function getHomeSeo(language) {
  return buildLocalizedSeoPayload({
    language,
    path: '/',
    titleKey: 'SEO 首页标题',
    descriptionKey: 'SEO 首页描述',
    keywordsKey: 'SEO 首页关键词',
  });
}

export function getPricingSeo(language) {
  return buildLocalizedSeoPayload({
    language,
    path: '/pricing',
    titleKey: 'SEO 价格页标题',
    descriptionKey: 'SEO 价格页描述',
    keywordsKey: 'SEO 价格页关键词',
  });
}

function uniqueValues(values = [], limit = 8) {
  return Array.from(new Set((values || []).filter(Boolean))).slice(0, limit);
}

function normalizePlan(rawPlan) {
  return rawPlan?.plan || rawPlan || null;
}

function inferPlanSeries(plan) {
  const text = [
    plan?.title,
    plan?.subtitle,
    plan?.upgrade_group,
    ...(Array.isArray(plan?.allowed_groups) ? plan.allowed_groups : []),
    ...(Array.isArray(plan?.allowed_models) ? plan.allowed_models : []),
    ...(Array.isArray(plan?.allowed_vendor_names)
      ? plan.allowed_vendor_names
      : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const isClaude =
    text.includes('claude') ||
    text.includes('anthropic') ||
    text.includes('cc-');
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

function getPlanPath(planId) {
  return `/pricing/subscription-plans/${planId}`;
}

function getPlanSeoDescription(plan, language) {
  if (plan?.subtitle) {
    return plan.subtitle;
  }
  const models = uniqueValues(plan?.allowed_models, 3);
  const vendors = uniqueValues(plan?.allowed_vendor_names, 2);
  const modelText =
    models.length > 0
      ? models.join(' / ')
      : getSeoMessage(language, 'SEO 多模型');
  const vendorText =
    vendors.length > 0
      ? vendors.join(' / ')
      : getSeoMessage(language, 'SEO 兼容供应商');
  return getSeoMessage(language, 'SEO 套餐描述', {
    modelText,
    title: plan?.title || getSeoMessage(language, 'SEO 订阅套餐'),
    vendorText,
  });
}

function buildSubscriptionListJsonLd(language, plans = []) {
  const enabledPlans = plans
    .map(normalizePlan)
    .filter((plan) => plan?.id && plan?.enabled !== false)
    .slice(0, 12);

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: getSeoMessage(language, 'SEO 订阅套餐列表名称'),
    url: `${SITE_URL}/pricing?tab=subscription-plans`,
    numberOfItems: enabledPlans.length,
    itemListElement: enabledPlans.map((plan, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${getPlanPath(plan.id)}`,
      name:
        plan.title ||
        getSeoMessage(language, 'SEO 套餐编号', {
          id: plan.id,
        }),
    })),
  };
}

function buildSubscriptionPlanJsonLd(language, plan) {
  const price = Number(
    plan?.effective_price_amount ??
      plan?.discount_price_amount ??
      plan?.price_amount ??
      0,
  );
  const currency = String(plan?.currency || 'USD').toUpperCase();
  const description = getPlanSeoDescription(plan, language);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name:
      plan?.title ||
      getSeoMessage(language, 'SEO 订阅套餐编号', {
        id: plan?.id || '',
      }),
    description,
    category: getSeoMessage(language, 'SEO AI 订阅套餐'),
    brand: {
      '@type': 'Brand',
      name: SITE_NAME,
    },
    sku: String(plan?.id || ''),
    url: `${SITE_URL}${getPlanPath(plan?.id)}`,
    offers: {
      '@type': 'Offer',
      priceCurrency: currency,
      price,
      availability:
        plan?.enabled === false
          ? 'https://schema.org/Discontinued'
          : 'https://schema.org/InStock',
      url: `${SITE_URL}${getPlanPath(plan?.id)}`,
      seller: {
        '@type': 'Organization',
        name: SITE_NAME,
      },
    },
  };
}

export function getSubscriptionPlansSeo(language, rawPlans = [], options = {}) {
  const plans = rawPlans
    .map(normalizePlan)
    .filter((plan) => plan?.id && plan?.enabled !== false);
  const {
    canonicalPath = '/pricing?tab=subscription-plans',
    series: currentSeries = 'all',
    sort = 'recommended',
    view = 'card',
  } = options;
  const availableSeries = uniqueValues(
    plans.map((plan) => inferPlanSeries(plan)),
    3,
  );
  const models = uniqueValues(
    plans.flatMap((plan) =>
      Array.isArray(plan?.allowed_models) ? plan.allowed_models : [],
    ),
    6,
  );
  const zh = isChineseLanguage(language);
  const seriesMap = {
    all: getSeoMessage(language, 'SEO 全部系列'),
    claude: getSeoMessage(language, 'SEO Claude 系列'),
    codex: getSeoMessage(language, 'SEO Codex 系列'),
    mixed: getSeoMessage(language, 'SEO 混合系列'),
  };
  const sortMap = {
    recommended: getSeoMessage(language, 'SEO 推荐优先'),
    price_asc: getSeoMessage(language, 'SEO 价格从低到高'),
    price_desc: getSeoMessage(language, 'SEO 价格从高到低'),
    value_desc: getSeoMessage(language, 'SEO 权益从多到少'),
  };
  const availableSeriesText =
    joinSeoList(language, availableSeries) ||
    getSeoMessage(
      language,
      zh ? 'SEO Claude Codex 系列' : 'SEO Claude 与 Codex 系列',
    );
  const modelText =
    joinSeoList(language, models) || getSeoMessage(language, 'SEO 多模型');
  const currentSeriesText = seriesMap[currentSeries] || seriesMap.all;
  const currentSortText =
    sortMap[options.sort || 'recommended'] || sortMap.recommended;
  const currentViewText = getSeoMessage(
    language,
    view === 'table' ? 'SEO 列表视图' : 'SEO 卡片视图',
  );

  return buildLocalizedSeoPayload({
    language,
    path: canonicalPath,
    titleKey: 'SEO 套餐列表标题',
    titleVars: {
      series: currentSeriesText,
    },
    descriptionKey: 'SEO 套餐列表描述',
    descriptionVars: {
      seriesList: availableSeriesText,
      series: currentSeriesText,
      sort: currentSortText,
      view: currentViewText,
      models: modelText,
    },
    keywordsKey: 'SEO 套餐列表关键词',
    keywordsVars: {
      series: currentSeriesText,
      sort: currentSortText,
      models:
        joinSeoList(language, models.slice(0, 4)) ||
        getSeoMessage(language, 'SEO 多模型'),
    },
    jsonLd: buildSubscriptionListJsonLd(language, plans),
  });
}

export function getSubscriptionPlanSeo(language, rawPlan) {
  const plan = normalizePlan(rawPlan);
  if (!plan?.id) {
    return getSubscriptionPlansSeo(language, []);
  }
  const series = inferPlanSeries(plan);
  const models = uniqueValues(plan?.allowed_models, 5);
  const groups = uniqueValues(plan?.allowed_groups, 4);
  const description = getPlanSeoDescription(plan, language);
  return buildLocalizedSeoPayload({
    language,
    path: getPlanPath(plan.id),
    titleKey: 'SEO 套餐详情标题',
    titleVars: {
      title: plan.title || getSeoMessage(language, 'SEO 订阅套餐'),
    },
    descriptionKey: 'SEO 套餐详情描述',
    descriptionVars: {
      description,
    },
    keywordsKey: 'SEO 套餐详情关键词',
    keywordsVars: {
      title: plan.title || getSeoMessage(language, 'SEO 订阅套餐'),
      series,
      models:
        joinSeoList(language, models) || getSeoMessage(language, 'SEO 多模型'),
      groups:
        joinSeoList(language, groups) ||
        getSeoMessage(language, 'SEO 全部系列'),
    },
    jsonLd: buildSubscriptionPlanJsonLd(language, plan),
  });
}

export function getContactSeo(language) {
  return buildLocalizedSeoPayload({
    language,
    path: '/contact',
    titleKey: 'SEO 联系页标题',
    descriptionKey: 'SEO 联系页描述',
    keywordsKey: 'SEO 联系页关键词',
  });
}

export function getStatusSeo(language) {
  return buildLocalizedSeoPayload({
    language,
    path: '/status',
    titleKey: 'SEO 状态页标题',
    descriptionKey: 'SEO 状态页描述',
    keywordsKey: 'SEO 状态页关键词',
  });
}

export function getDocsSeo(language) {
  return buildLocalizedSeoPayload({
    language,
    path: '/docs',
    titleKey: 'SEO 文档页标题',
    descriptionKey: 'SEO 文档页描述',
    keywordsKey: 'SEO 文档页关键词',
  });
}

export function getPolicySeo(language, type) {
  const isPrivacy = type === 'privacy';
  return buildLocalizedSeoPayload({
    language,
    path: isPrivacy ? '/privacy-policy' : '/user-agreement',
    titleKey: isPrivacy ? 'SEO 隐私标题' : 'SEO 协议标题',
    descriptionKey: isPrivacy ? 'SEO 隐私描述' : 'SEO 协议描述',
    keywordsKey: isPrivacy ? 'SEO 隐私关键词' : 'SEO 协议关键词',
  });
}

export function getAuthSeo(language, type) {
  const config = {
    login: {
      path: '/login',
      titleKey: 'SEO 登录标题',
      descriptionKey: 'SEO 登录描述',
    },
    register: {
      path: '/register',
      titleKey: 'SEO 注册标题',
      descriptionKey: 'SEO 注册描述',
    },
    reset: {
      path: '/reset',
      titleKey: 'SEO 重置标题',
      descriptionKey: 'SEO 重置描述',
    },
    resetConfirm: {
      path: '/user/reset',
      titleKey: 'SEO 确认重置标题',
      descriptionKey: 'SEO 确认重置描述',
    },
  };

  const current = config[type];
  return buildLocalizedSeoPayload({
    language,
    path: current.path,
    titleKey: current.titleKey,
    descriptionKey: current.descriptionKey,
    keywordsKey: 'SEO 账号访问关键词',
    robots: 'noindex,nofollow',
  });
}

function buildRouteSeo({
  language,
  path,
  titleKey,
  titleVars,
  descriptionKey,
  descriptionVars,
  keywordsKey = 'SEO 路由关键词',
  keywordsVars,
  robots = 'index,follow',
}) {
  const routeName = getSeoMessage(language, titleKey, titleVars);
  return buildLocalizedSeoPayload({
    language,
    path,
    titleKey,
    titleVars,
    descriptionKey,
    descriptionVars,
    keywordsKey,
    keywordsVars: keywordsVars || {
      name: routeName,
    },
    robots,
  });
}

function matchesPath(pathname, pattern) {
  if (pattern.endsWith('*')) {
    return pathname.startsWith(pattern.slice(0, -1));
  }
  return pathname === pattern;
}

const ROUTE_SEO_CONFIGS = [
  {
    pattern: '/console',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 控制台页标题',
        descriptionKey: 'SEO 控制台页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/package',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 套餐管理页标题',
        descriptionKey: 'SEO 套餐管理页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/token',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 令牌管理页标题',
        descriptionKey: 'SEO 令牌管理页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/channel',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 渠道管理页标题',
        descriptionKey: 'SEO 渠道管理页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/token/admin',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 管理员令牌页标题',
        descriptionKey: 'SEO 管理员令牌页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/ecomagent',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO EcomAgent页标题',
        descriptionKey: 'SEO EcomAgent页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/playground',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO Playground页标题',
        descriptionKey: 'SEO Playground页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/redemption',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 兑换码页标题',
        descriptionKey: 'SEO 兑换码页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/user',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 用户管理页标题',
        descriptionKey: 'SEO 用户管理页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/risk-control',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 风控页标题',
        descriptionKey: 'SEO 风控页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/setting',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 设置页标题',
        descriptionKey: 'SEO 设置页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/topup',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 充值页标题',
        descriptionKey: 'SEO 充值页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/invoice',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 发票页标题',
        descriptionKey: 'SEO 发票页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/invoice-admin',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 发票后台页标题',
        descriptionKey: 'SEO 发票后台页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/checkin-admin',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 签到后台页标题',
        descriptionKey: 'SEO 签到后台页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/checkin-lottery',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 签到管理页标题',
        descriptionKey: 'SEO 签到管理页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/activity-lottery',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 活动抽奖页标题',
        descriptionKey: 'SEO 活动抽奖页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/invite',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 邀请页标题',
        descriptionKey: 'SEO 邀请页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/log',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 日志页标题',
        descriptionKey: 'SEO 日志页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/finance',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 财务中心页标题',
        descriptionKey: 'SEO 财务中心页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/midjourney',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 绘图日志页标题',
        descriptionKey: 'SEO 绘图日志页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/task',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 任务页标题',
        descriptionKey: 'SEO 任务页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/models',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 模型管理页标题',
        descriptionKey: 'SEO 模型管理页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/deployment',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 模型部署页标题',
        descriptionKey: 'SEO 模型部署页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/subscription',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 订阅后台页标题',
        descriptionKey: 'SEO 订阅后台页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/personal',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 个人设置页标题',
        descriptionKey: 'SEO 个人设置页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/console/chat/*',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 聊天页标题',
        descriptionKey: 'SEO 聊天页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/chat2link',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO Chat2Link页标题',
        descriptionKey: 'SEO Chat2Link页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/setup',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 初始化页标题',
        descriptionKey: 'SEO 初始化页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/forbidden',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO 无权限页标题',
        descriptionKey: 'SEO 无权限页描述',
        robots: 'noindex,nofollow',
      }),
  },
  {
    pattern: '/oauth/*',
    build: (language, pathname) =>
      buildRouteSeo({
        language,
        path: pathname,
        titleKey: 'SEO OAuth页标题',
        descriptionKey: 'SEO OAuth页描述',
        robots: 'noindex,nofollow',
      }),
  },
];

export function getRouteSeo(language, pathname) {
  if (!pathname) {
    return getHomeSeo(language);
  }

  if (pathname === '/') return getHomeSeo(language);
  if (pathname === '/pricing') return getPricingSeo(language);
  if (pathname.startsWith('/pricing/subscription-plans/')) {
    return buildRouteSeo({
      language,
      path: pathname,
      titleKey: 'SEO 套餐详情回退标题',
      descriptionKey: 'SEO 套餐详情回退描述',
      keywordsKey: 'SEO 套餐详情回退关键词',
    });
  }
  if (pathname === '/status') return getStatusSeo(language);
  if (pathname === '/contact') return getContactSeo(language);
  if (pathname === '/docs') return getDocsSeo(language);
  if (pathname === '/privacy-policy') return getPolicySeo(language, 'privacy');
  if (pathname === '/user-agreement')
    return getPolicySeo(language, 'agreement');
  if (pathname === '/login') return getAuthSeo(language, 'login');
  if (pathname === '/register') return getAuthSeo(language, 'register');
  if (pathname === '/reset') return getAuthSeo(language, 'reset');
  if (pathname === '/user/reset') return getAuthSeo(language, 'resetConfirm');

  const matchedConfig = ROUTE_SEO_CONFIGS.find((item) =>
    matchesPath(pathname, item.pattern),
  );
  if (matchedConfig) {
    return matchedConfig.build(language, pathname);
  }

  return buildRouteSeo({
    language,
    path: pathname,
    titleKey: 'SEO 404标题',
    descriptionKey: 'SEO 404描述',
    keywordsKey: 'SEO 404关键词',
    robots: 'noindex,nofollow',
  });
}
