import enLocale from '../i18n/locales/en.json';
import frLocale from '../i18n/locales/fr.json';
import jaLocale from '../i18n/locales/ja.json';
import ruLocale from '../i18n/locales/ru.json';
import viLocale from '../i18n/locales/vi.json';
import zhCNLocale from '../i18n/locales/zh-CN.json';
import zhTWLocale from '../i18n/locales/zh-TW.json';
import { normalizeLanguage } from '../i18n/language';

const SITE_URL =
  (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://fishxcode.com').replace(
    /\/$/,
    '',
  );
const SITE_NAME = 'FishXCode AI';
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
  return `${SITE_URL}/${isChineseLanguage(language) ? 'og-home-zh.svg' : 'og-home-en.svg'}`;
}

function isChineseLanguage(language) {
  return language?.startsWith('zh');
}

function getSeoTranslations(language) {
  const normalizedLanguage = normalizeLanguage(language) || 'zh-CN';
  return SEO_LOCALES[normalizedLanguage] || SEO_LOCALES['zh-CN'];
}

function getSeoMessage(language, key, vars = {}) {
  const translations = getSeoTranslations(language);
  const template = translations?.[key] || SEO_LOCALES['zh-CN']?.[key] || key;
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    const value = vars[name];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function getSeoLocale(language) {
  return isChineseLanguage(language) ? 'zh_CN' : 'en_US';
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

export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    image: `${SITE_URL}/og-home-zh.svg`,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        availableLanguage: ['zh-CN', 'en-US'],
        url: `${SITE_URL}/contact`,
      },
    ],
    sameAs: ['https://qm.qq.com/q/Ce2PaYrbmo'],
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
      ? 'FishXCode AI 提供企业级 Claude API 官方通道中转服务，支持套餐制与企业采购，并兼容 GPT、Gemini 等常用模型。'
      : 'FishXCode AI provides an enterprise Claude API gateway through official Anthropic channels, with subscription plans, enterprise purchasing support, and compatibility with common models such as GPT and Gemini.',
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
  return buildSeoPayload({
    language,
    path: '/',
    titleZh: '企业级 Claude API 官方通道中转 | FishXCode AI',
    titleEn: 'Enterprise Claude API Gateway | FishXCode AI',
    descriptionZh:
      'FishXCode AI 提供企业级 Claude API 官方通道中转，不走逆向，支持包月套餐、企业采购和增值税发票，并兼容 GPT、Gemini 等常用模型。',
    descriptionEn:
      'FishXCode AI provides an enterprise Claude API gateway through official Anthropic channels, prioritizing stable Claude access with cache-based cost reduction, enterprise invoice support, and compatibility with common models such as GPT and Gemini.',
    keywordsZh:
      'Claude API,Claude中转,Anthropic官方通道,企业级Claude API,AI中转服务,智能缓存,企业采购,增值税发票,GPT,Gemini',
    keywordsEn:
      'Claude API, Anthropic gateway, enterprise Claude API, AI gateway service, cache optimization, enterprise invoice support, GPT, Gemini',
  });
}

export function getPricingSeo(language) {
  return buildSeoPayload({
    language,
    path: '/pricing',
    titleZh: 'Claude Codex 订阅价格与套餐 | FishXCode AI',
    titleEn: 'Claude Codex Pricing Plans | FishXCode AI',
    descriptionZh:
      '查看 FishXCode AI 的 Claude、Codex 套餐，支持包月、周卡、天卡和企业采购。',
    descriptionEn:
      'Compare Claude and Codex pricing plans from FishXCode AI, including monthly, weekly, and daily options for individuals, students, and teams.',
    keywordsZh:
      'Claude价格,Codex价格,Claude套餐,Codex套餐,AI Coding订阅价格,包月,周卡,天卡',
    keywordsEn:
      'Claude pricing, Codex pricing, AI Coding pricing, monthly subscription, weekly pass, daily pass',
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
    models.length > 0 ? models.join(' / ') : getSeoMessage(language, 'SEO 多模型');
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
    plan?.effective_price_amount ?? plan?.discount_price_amount ?? plan?.price_amount ?? 0,
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
  const availableSeries = uniqueValues(plans.map((plan) => inferPlanSeries(plan)), 3);
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
    availableSeries.join('、') ||
    getSeoMessage(language, zh ? 'SEO Claude Codex 系列' : 'SEO Claude 与 Codex 系列');
  const modelText = models.join('、') || getSeoMessage(language, 'SEO 多模型');
  const currentSeriesText = seriesMap[currentSeries] || seriesMap.all;
  const currentSortText = sortMap[options.sort || 'recommended'] || sortMap.recommended;
  const currentViewText = zh
    ? getSeoMessage(language, view === 'table' ? 'SEO 列表视图' : 'SEO 卡片视图')
    : getSeoMessage(language, view === 'table' ? 'SEO 列表视图' : 'SEO 卡片视图');

  return buildSeoPayload({
    language,
    path: canonicalPath,
    titleZh: `${currentSeriesText}订阅套餐价格与购买方案 | FishXCode AI`,
    titleEn: `${currentSeriesText} subscription plans | FishXCode AI`,
    descriptionZh: `查看 FishXCode AI 当前可售的 ${availableSeriesText} 套餐，当前为 ${currentSeriesText}，按 ${currentSortText} 排序，使用 ${currentViewText} 展示，覆盖 ${modelText} 等能力。`,
    descriptionEn: `Explore current ${availableSeriesText} plans from FishXCode AI. The current page shows ${currentSeriesText}, sorted by ${currentSortText}, in ${currentViewText}, covering ${modelText}.`,
    keywordsZh: `订阅套餐,Claude套餐,Codex套餐,AI订阅,套餐价格,在线购买,${currentSeriesText},${currentSortText},${models.slice(0, 4).join(',')}`,
    keywordsEn: `subscription plans, Claude plans, Codex plans, AI subscriptions, pricing, online purchase, ${currentSeriesText}, ${currentSortText}, ${models.slice(0, 4).join(', ')}`,
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
  return buildSeoPayload({
    language,
    path: getPlanPath(plan.id),
    titleZh: `${plan.title} 套餐详情与购买 | FishXCode AI`,
    titleEn: `${plan.title} Plan Details | FishXCode AI`,
    descriptionZh: description,
    descriptionEn: description,
    keywordsZh: `${plan.title},套餐详情,订阅购买,${series},${models.join(',')},${groups.join(',')}`,
    keywordsEn: `${plan.title}, plan details, subscription purchase, ${series}, ${models.join(', ')}, ${groups.join(', ')}`,
    jsonLd: buildSubscriptionPlanJsonLd(language, plan),
  });
}

export function getContactSeo(language) {
  return buildSeoPayload({
    language,
    path: '/contact',
    titleZh: '联系我们与官方客服渠道 | FishXCode AI',
    titleEn: 'Contact and Support Channels | FishXCode AI',
    descriptionZh:
      '查看 FishXCode AI 官方联系渠道，包括 QQ 群、微信号、微信群与 QQ 客服，支持售前咨询、企业采购和售后沟通。',
    descriptionEn:
      'Reach FishXCode AI through official QQ groups, WeChat, and support channels for presales, onboarding, student use, and team collaboration.',
    keywordsZh:
      'FishXCode联系方式,官方客服,QQ群,微信客服,团队合作,售前咨询,学生支持',
    keywordsEn:
      'FishXCode contact, support channels, QQ group, WeChat support, team onboarding',
  });
}

export function getStatusSeo(language) {
  return buildSeoPayload({
    language,
    path: '/status',
    titleZh: '服务状态与平台说明 | FishXCode AI',
    titleEn: 'Service Status and Platform Info | FishXCode AI',
    descriptionZh:
      '查看 FishXCode AI 的服务状态、平台说明与基础介绍，帮助你了解当前可用性、接入情况与站点信息。',
    descriptionEn:
      'Check FishXCode AI service status, platform information, and availability details before using the service.',
    keywordsZh: '服务状态,平台说明,系统状态,可用性,站点信息,AI Coding服务',
    keywordsEn: 'service status, platform info, system status, uptime, AI Coding service',
  });
}

export function getDocsSeo(language) {
  return buildSeoPayload({
    language,
    path: '/docs',
    titleZh: '接入文档与使用指南 | FishXCode AI',
    titleEn: 'Claude Integration Docs | FishXCode AI',
    descriptionZh:
      '查看 FishXCode AI 的 Claude 接入文档、使用说明与配置指南，了解套餐制接入与企业合作支持。',
    descriptionEn:
      'Read FishXCode AI Claude integration docs and setup guides to start using the official-compatible API quickly.',
    keywordsZh: 'Claude接入文档,Claude文档,API接入,使用指南,配置教程,Claude API',
    keywordsEn: 'Claude integration docs, Claude docs, API integration, setup guide, Claude API',
  });
}

export function getPolicySeo(language, type) {
  const isPrivacy = type === 'privacy';
  return buildSeoPayload({
    language,
    path: isPrivacy ? '/privacy-policy' : '/user-agreement',
    titleZh: isPrivacy
      ? '隐私政策 | FishXCode AI'
      : '用户协议 | FishXCode AI',
    titleEn: isPrivacy
      ? 'Privacy Policy | FishXCode AI'
      : 'Terms of Service | FishXCode AI',
    descriptionZh: isPrivacy
      ? '查看 FishXCode AI 隐私政策，了解账号、订阅与访问过程中的数据收集、使用与保护方式。'
      : '查看 FishXCode AI 用户协议，了解订阅服务、账号使用、支付与平台规则。',
    descriptionEn: isPrivacy
      ? 'Read the FishXCode AI privacy policy for data collection, usage, and protection details.'
      : 'Read the FishXCode AI terms for subscriptions, account usage, payments, and platform rules.',
    keywordsZh: isPrivacy
      ? '隐私政策,数据保护,账号安全,订阅数据'
      : '用户协议,服务条款,订阅规则,支付规则',
    keywordsEn: isPrivacy
      ? 'privacy policy, data protection, account security'
      : 'terms of service, subscription policy, payment terms',
  });
}

export function getAuthSeo(language, type) {
  const config = {
    login: {
      path: '/login',
      titleZh: '登录账号 | FishXCode AI',
      titleEn: 'Login | FishXCode AI',
      descriptionZh:
        '登录 FishXCode AI 账号，继续使用 Claude、Codex 等 AI Coding 订阅服务。',
      descriptionEn:
        'Login to FishXCode AI and continue using Claude and Codex subscription services.',
    },
    register: {
      path: '/register',
      titleZh: '注册账号 | FishXCode AI',
      titleEn: 'Register | FishXCode AI',
      descriptionZh:
        '注册 FishXCode AI 账号，开通 Claude、Codex 等 AI Coding 国际中转订阅服务。',
      descriptionEn:
        'Create a FishXCode AI account for Claude and Codex subscription access.',
    },
    reset: {
      path: '/reset',
      titleZh: '重置密码 | FishXCode AI',
      titleEn: 'Reset Password | FishXCode AI',
      descriptionZh: '重置 FishXCode AI 账号密码。',
      descriptionEn: 'Reset your FishXCode AI account password.',
    },
    resetConfirm: {
      path: '/user/reset',
      titleZh: '确认重置密码 | FishXCode AI',
      titleEn: 'Confirm Password Reset | FishXCode AI',
      descriptionZh: '确认 FishXCode AI 账号密码重置流程。',
      descriptionEn: 'Confirm the FishXCode AI password reset flow.',
    },
  };

  const current = config[type];
  return buildSeoPayload({
    language,
    path: current.path,
    titleZh: current.titleZh,
    titleEn: current.titleEn,
    descriptionZh: current.descriptionZh,
    descriptionEn: current.descriptionEn,
    keywordsZh: '登录,注册,密码重置,账号访问',
    keywordsEn: 'login, register, reset password, account access',
    robots: 'noindex,nofollow',
  });
}
