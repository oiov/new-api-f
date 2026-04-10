const SITE_URL =
  (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://fishxcode.com').replace(
    /\/$/,
    '',
  );
const SITE_NAME = 'FishXCode AI';
function getDefaultImage(language) {
  return `${SITE_URL}/${isChineseLanguage(language) ? 'og-home-zh.svg' : 'og-home-en.svg'}`;
}

function isChineseLanguage(language) {
  return language?.startsWith('zh');
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
