const SITE_URL = (
  import.meta.env.VITE_PUBLIC_SITE_URL || 'https://nbility.dev'
).replace(/\/$/, '');
const SITE_NAME = 'NBility';
const DEFAULT_IMAGE = `${SITE_URL}/cover-4.webp`;

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
    image: DEFAULT_IMAGE,
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
    image: DEFAULT_IMAGE,
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
      ? 'NBility 提供 Claude、Codex 等 AI Coding 国际中转订阅服务。'
      : 'NBility provides Claude and Codex subscription access for AI Coding workflows.',
  };
}

export function buildServiceJsonLd(language) {
  const zh = isChineseLanguage(language);
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'AI Coding Subscription Service',
    name: zh
      ? 'Claude Codex AI Coding 国际中转订阅'
      : 'Claude Codex AI Coding subscription access',
    provider: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    areaServed: 'Worldwide',
    audience: {
      '@type': 'Audience',
      audienceType: zh
        ? '个人开发者、学生、团队用户'
        : 'Individual developers, students, and teams',
    },
    url: SITE_URL,
    image: DEFAULT_IMAGE,
    description: zh
      ? '支持包月、周卡、天卡的 Claude 与 Codex 国际中转订阅服务。'
      : 'Claude and Codex subscription access with monthly, weekly, and daily plans.',
  };
}

export function getHomeSeo(language) {
  return buildSeoPayload({
    language,
    path: '/',
    titleZh: 'AI Coding 国际中转订阅站 | NBility',
    titleEn: 'AI Coding Subscription Hub | NBility',
    descriptionZh:
      'NBility 提供 Claude、Codex 等 AI Coding 国际中转订阅服务，主打包月订阅，同时支持周卡、天卡，覆盖个人开发者、学生与团队协作的稳定接入需求。',
    descriptionEn:
      'NBility provides Claude and Codex subscription access for AI Coding, with monthly, weekly, and daily plans for developers, students, and teams.',
    keywordsZh:
      'AI Coding,Claude订阅,Codex订阅,Claude中转,Codex中转,包月订阅,周卡,天卡,团队订阅,学生订阅',
    keywordsEn:
      'AI Coding, Claude subscription, Codex subscription, monthly plan, weekly pass, daily pass, team subscription, student plan',
  });
}

export function getPricingSeo(language) {
  return buildSeoPayload({
    language,
    path: '/pricing',
    titleZh: 'Claude Codex 订阅价格与套餐 | NBility',
    titleEn: 'Claude Codex Pricing Plans | NBility',
    descriptionZh:
      '查看 NBility 的 Claude、Codex 国际中转套餐，支持包月、周卡与天卡，适合个人开发者、学生用户和团队采购。',
    descriptionEn:
      'Compare Claude and Codex pricing plans from NBility, including monthly, weekly, and daily options for individuals, students, and teams.',
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
    titleZh: '联系我们与官方客服渠道 | NBility',
    titleEn: 'Contact and Support Channels | NBility',
    descriptionZh:
      '查看 NBility 官方联系渠道，包括 QQ 群、微信号、微信群与 QQ 客服，适合售前咨询、团队合作、学生使用和售后支持。',
    descriptionEn:
      'Reach NBility through official QQ groups, WeChat, and support channels for presales, onboarding, student use, and team collaboration.',
    keywordsZh:
      'NBility联系方式,官方客服,QQ群,微信客服,团队合作,售前咨询,学生支持',
    keywordsEn:
      'NBility contact, support channels, QQ group, WeChat support, team onboarding',
  });
}

export function getStatusSeo(language) {
  return buildSeoPayload({
    language,
    path: '/status',
    titleZh: '服务状态与平台说明 | NBility',
    titleEn: 'Service Status and Platform Info | NBility',
    descriptionZh:
      '查看 NBility 的服务状态、平台说明与基础介绍，帮助你了解当前可用性、接入情况与站点信息。',
    descriptionEn:
      'Check NBility service status, platform information, and availability details before using the service.',
    keywordsZh: '服务状态,平台说明,系统状态,可用性,站点信息,AI Coding服务',
    keywordsEn:
      'service status, platform info, system status, uptime, AI Coding service',
  });
}

export function getDocsSeo(language) {
  return buildSeoPayload({
    language,
    path: '/docs',
    titleZh: '接入文档与使用指南 | NBility',
    titleEn: 'Documentation and Usage Guide | NBility',
    descriptionZh:
      '查看 NBility 接入文档、使用说明与配置指南，快速完成 Claude、Codex 等 AI Coding 服务接入。',
    descriptionEn:
      'Read NBility docs and setup guides to start using Claude and Codex for AI Coding workflows.',
    keywordsZh: '接入文档,使用指南,Claude文档,Codex文档,API接入,AI Coding教程',
    keywordsEn:
      'documentation, setup guide, Claude docs, Codex docs, API access, AI Coding guide',
  });
}

export function getPolicySeo(language, type) {
  const isPrivacy = type === 'privacy';
  return buildSeoPayload({
    language,
    path: isPrivacy ? '/privacy-policy' : '/user-agreement',
    titleZh: isPrivacy ? '隐私政策 | NBility' : '用户协议 | NBility',
    titleEn: isPrivacy
      ? 'Privacy Policy | NBility'
      : 'Terms of Service | NBility',
    descriptionZh: isPrivacy
      ? '查看 NBility 隐私政策，了解账号、订阅与访问过程中的数据收集、使用与保护方式。'
      : '查看 NBility 用户协议，了解订阅服务、账号使用、支付与平台规则。',
    descriptionEn: isPrivacy
      ? 'Read the NBility privacy policy for data collection, usage, and protection details.'
      : 'Read the NBility terms for subscriptions, account usage, payments, and platform rules.',
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
      titleZh: '登录账号 | NBility',
      titleEn: 'Login | NBility',
      descriptionZh:
        '登录 NBility 账号，继续使用 Claude、Codex 等 AI Coding 订阅服务。',
      descriptionEn:
        'Login to NBility and continue using Claude and Codex subscription services.',
    },
    register: {
      path: '/register',
      titleZh: '注册账号 | NBility',
      titleEn: 'Register | NBility',
      descriptionZh:
        '注册 NBility 账号，开通 Claude、Codex 等 AI Coding 国际中转订阅服务。',
      descriptionEn:
        'Create a NBility account for Claude and Codex subscription access.',
    },
    reset: {
      path: '/reset',
      titleZh: '重置密码 | NBility',
      titleEn: 'Reset Password | NBility',
      descriptionZh: '重置 NBility 账号密码。',
      descriptionEn: 'Reset your NBility account password.',
    },
    resetConfirm: {
      path: '/user/reset',
      titleZh: '确认重置密码 | NBility',
      titleEn: 'Confirm Password Reset | NBility',
      descriptionZh: '确认 NBility 账号密码重置流程。',
      descriptionEn: 'Confirm the NBility password reset flow.',
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
