/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Button, Input, ScrollItem, ScrollList, Tag, Typography } from '@douyinfe/semi-ui';
import {
  IconActivity,
  IconBolt,
  IconBriefcase,
  IconCopy,
  IconFile,
  IconPlay,
  IconSafe,
  IconServer,
  IconShield,
  IconTickCircle,
} from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';

const ProviderLogos = lazy(() => import('./ProviderLogos'));

const { Text, Title, Paragraph } = Typography;

// 数字递增动画 hook
function useCountUp(target, duration = 1200, trigger = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!trigger || typeof window === 'undefined') return;
    let startTime = null;
    let frameId = null;
    const step = (ts) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      }
    };
    frameId = window.requestAnimationFrame(step);
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [trigger, target, duration]);
  return val;
}

// 滚动可见性 hook（触发一次后断开）
function useInView(threshold = 0.12) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window === 'undefined' ||
      typeof window.IntersectionObserver !== 'function'
    ) {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

const trustItems = (t) => [
  {
    icon: <IconShield size='large' />,
    title: t('仅接 Anthropic 官方通道'),
    description: t('每次请求均走 Anthropic 官方链路，不提供逆向，不混用第三方号池，适合对合规、稳定和数据路径有要求的团队。'),
  },
  {
    icon: <IconBolt size='large' />,
    title: t('智能缓存降本，但仍是官方计费逻辑'),
    description: t('缓存命中率可达 80% 以上，命中部分按缓存价格计费，帮助高频调用场景显著降低 Token 开销。'),
  },
  {
    icon: <IconBriefcase size='large' />,
    title: t('支持企业采购与正规增值税发票'),
    description: t('支持标准采购、对账与开票流程，便于研发团队、业务团队和财务团队统一落地。'),
  },
];

const featureItems = (t) => [
  {
    icon: <IconServer size='large' />,
    title: t('兼容官方 API，分钟级完成迁移'),
    description: t('保持官方接口格式和调用方式，只需替换 Base URL 与 API Key，现有业务代码基本无需重写。'),
  },
  {
    icon: <IconActivity size='large' />,
    title: t('面向生产环境的稳定接入能力'),
    description: t('针对企业与高频调用场景提供持续可用的接入能力和技术支持，降低业务切换与上线风险。'),
  },
  {
    icon: <IconSafe size='large' />,
    title: t('账单透明，适合持续规模化使用'),
    description: t('延续官方模型计费逻辑，叠加缓存优化与企业折扣，既方便成本核算，也适合长期扩容。'),
  },
];

const accessModeItems = (t) => [
  {
    badge: t('官方 API 直连 · 按量'),
    title: t('官方直连 Anthropic'),
    description: t('不降智，不混号'),
    points: [
      t('官方链路，更稳更快'),
      t('不降智，不封号'),
      t('适合正式项目'),
    ],
  },
  {
    badge: t('套餐制 · 按次 / 额度'),
    title: t('套餐制 实惠 便捷'),
    description: t('先跑起来，再决定是否升级。'),
    points: [
      t('门槛更低，买完就能用'),
      t('便宜量大，长期用更划算'),
      t('适合长期稳定调用 上限高'),
    ],
  },
];

const subscriptionMarketingItems = (t) => [
  {
    icon: <IconBolt size='large' />,
    badge: t('按次套餐'),
    title: t('按次数'),
    description: t('以套餐配置为准'),
  },
  {
    icon: <IconActivity size='large' />,
    badge: t('全部订阅消耗'),
    title: t('按套餐明细结算'),
    description: t('按实际调用'),
  },
  {
    icon: <IconSafe size='large' />,
    badge: t('人工发放'),
    title: t('支付后进入待发放状态'),
    description: t('人工发放套餐支付成功后不会自动开通，需要管理员填写交付信息后完成发放。'),
  },
];

const testimonialItems = (t) => [
  {
    quote: t('以前总要在价格、稳定性和速度之间反复权衡。现在直接按使用阶段选就行，短期需求先买套餐，长期项目直接上官方直连。'),
    name: 'Lin',
    role: t('独立开发者'),
  },
  {
    quote: t('对我们这种小团队最重要的不是最低价，而是买完能马上用，出了问题有人处理，后续还能平滑升级。'),
    name: 'A',
    role: t('小团队负责人'),
  },
  {
    quote: t('Claude 系列套餐对高频写代码真的很友好，成本更可控；正式项目切到官方链路后，稳定性会明显更舒服。'),
    name: 'J',
    role: t('全栈工程师'),
  },
  {
    quote: t('以前最怕买了之后还要自己研究怎么接。现在发放、通知、激活都走完整链路，省掉很多沟通和排查成本。'),
    name: 'M',
    role: t('AI 产品经理'),
  },
];

const DesktopHomeLanding = ({
  t,
  isMobile,
  isChinese,
  serverAddress,
  endpointItems,
  endpointIndex,
  setEndpointIndex,
  handleCopyBaseURL,
  docsLink,
  isDemoSiteMode,
  version,
}) => {
  const [heroReady, setHeroReady] = useState(false);
  const [modeSpotlight, setModeSpotlight] = useState({ x: 50, y: 50 });
  const [heroSpotlight, setHeroSpotlight] = useState({ x: 50, y: 50 });
  useEffect(() => {
    const id = setTimeout(() => setHeroReady(true), 50);
    return () => clearTimeout(id);
  }, []);

  const count1 = useCountUp(100, 1200, heroReady);
  const count2 = useCountUp(80, 1500, heroReady);
  const count3 = useCountUp(60, 1800, heroReady);
  const [featRef, featInView] = useInView(0.1);
  const [providerRef, providerInView] = useInView(0.1);
  const trustCardItems = trustItems(t);
  const featureCardItems = featureItems(t);
  const hotSubscriptionItems = subscriptionMarketingItems(t);
  const testimonials = testimonialItems(t);
  const accessModes = accessModeItems(t);
  const stats = [
    { value: `${count1}%`, label: t('官方 API 通道') },
    { value: `>${count2}%`, label: t('缓存命中率') },
    { value: `${count3}%+`, label: t('Token 成本节省') },
  ];

  const anim = (name, delay) =>
    heroReady
      ? { animation: `${name} both`, animationDelay: `${delay}s` }
      : { opacity: 0 };

  const updateSpotlight = (event, setter) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setter({ x, y });
  };

  return (
    <div className='w-full overflow-x-hidden'>
      <section
        className='hl-spotlight-surface relative overflow-hidden border-b border-semi-color-border bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.9))]'
        style={{
          '--hl-mx': `${modeSpotlight.x}%`,
          '--hl-my': `${modeSpotlight.y}%`,
        }}
        onMouseMove={(event) => updateSpotlight(event, setModeSpotlight)}
        onMouseLeave={() => setModeSpotlight({ x: 50, y: 50 })}
      >
        <div className='blur-ball blur-ball-indigo' />
        <div className='blur-ball blur-ball-teal' />
        <div className='mx-auto flex w-full max-w-[1280px] flex-col justify-center px-4 pb-12 pt-16 md:px-6 md:pb-14 md:pt-20 lg:px-8 lg:pb-16 lg:pt-24'>
          <div className='grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-center'>
            <div className='relative z-[1]'>
              <div className='mb-5 flex flex-wrap items-center gap-3'>
                <a href='#official-direct-section'>
                  <Button
                    theme='solid'
                    type='primary'
                    className='!rounded-full !px-5'
                  >
                    {t('官方 API 直连 · 按量')}
                  </Button>
                </a>
                <a href='#package-mode-section'>
                  <Button className='!rounded-full !px-5'>
                    {t('套餐制 · 按次 / 额度')}
                  </Button>
                </a>
              </div>

              <div className='mb-5 flex flex-wrap items-center gap-3'>
                <Tag color='cyan' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  <span className='hl-pulse-dot' />
                  {t('官方 API 直连 · 按量')}
                </Tag>
                <Tag color='green' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  {t('套餐制 · 按次 / 额度')}
                </Tag>
                <Tag color='orange' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  {t('按你的使用阶段选择')}
                </Tag>
              </div>

              <Title
                heading={2}
                className={`!mb-5 !text-2xl !font-black !leading-[1.05] sm:!text-4xl md:!text-5xl ${isChinese ? 'tracking-[-0.03em]' : ''}`}
              >
                <span className='hl-gradient-text'>{t('两种模式，按你的使用阶段选择')}</span>
              </Title>

              <Paragraph className='!mb-0 max-w-3xl !text-base !leading-7 !text-semi-color-text-1 md:!text-lg'>
                {t('正式业务更适合官方 API 直连按量；如果想先低成本体验 Claude / Codex，就先买套餐制，按次或按额度使用。')}
              </Paragraph>

              <div className='mt-6 flex flex-wrap gap-3 text-sm text-semi-color-text-1'>
                {[
                  t('官方 API 直连 · 按量'),
                  t('套餐制 · 按次 / 额度'),
                  t('更适合长期用'),
                  t('按次套餐'),
                ].map((text) => (
                  <span
                    key={text}
                    className='hl-chip-hover inline-flex items-center gap-2 rounded-full border border-semi-color-border bg-white/70 px-3 py-1.5 backdrop-blur dark:bg-white/5'
                  >
                    <IconTickCircle className='text-emerald-500' />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            <div className='relative z-[1]'>
              <div className='hl-card-hover rounded-[24px] border border-semi-color-border bg-white/85 p-4 shadow-[0_32px_120px_rgba(14,165,233,0.12)] backdrop-blur dark:bg-[#0b1120]/80 sm:rounded-[32px] sm:p-6'>
                <div className='grid gap-4 lg:grid-cols-2'>
                  {accessModes.map((item, index) => (
                    <div
                      key={item.title}
                      className={`rounded-[24px] border p-5 ${
                        index === 0
                          ? 'border-cyan-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(239,246,255,0.98))]'
                          : 'border-emerald-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(236,253,245,0.98))]'
                      }`}
                    >
                      <div className='flex items-center justify-between gap-3'>
                    <Tag
                      color={index === 0 ? 'cyan' : 'green'}
                      shape='circle'
                      className='!px-3 !py-1 !text-xs !font-semibold'
                    >
                      {item.badge}
                    </Tag>
                  </div>
                      <Title heading={4} className='!mb-2 !mt-4 !leading-[1.15]'>
                        {item.title}
                      </Title>
                      <Paragraph className='!mb-0 !text-sm !leading-6 !text-semi-color-text-1'>
                        {item.description}
                      </Paragraph>
                      <div className='mt-4 space-y-3'>
                        {item.points.map((point) => (
                          <div
                            key={point}
                            className='rounded-2xl border border-semi-color-border bg-semi-color-bg-0/80 px-4 py-3'
                          >
                            <div className='flex items-start gap-3'>
                              <IconTickCircle className='mt-0.5 text-emerald-500' />
                              <span className='text-sm leading-6 text-semi-color-text-1'>{point}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Hero ── */}
      <section
        id='official-direct-section'
        className='hl-spotlight-surface relative overflow-hidden border-b border-semi-color-border'
        style={{
          '--hl-mx': `${heroSpotlight.x}%`,
          '--hl-my': `${heroSpotlight.y}%`,
        }}
        onMouseMove={(event) => updateSpotlight(event, setHeroSpotlight)}
        onMouseLeave={() => setHeroSpotlight({ x: 50, y: 50 })}
      >
        <div className='blur-ball blur-ball-indigo' />
        <div className='blur-ball blur-ball-teal' />
        <div className='mx-auto flex w-full max-w-[1280px] flex-col justify-center px-4 pb-12 pt-16 sm:min-h-[720px] sm:pb-20 sm:pt-24 md:px-6 lg:px-8'>
          <div className='grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:items-center'>
            {/* 左侧：文案 */}
            <div className='relative z-[1]'>
              {/* 标签行 */}
              <div
                className='mb-5 flex flex-wrap items-center gap-3'
                style={anim('hl-fade-up 0.6s ease', 0.05)}
              >
                <Tag color='cyan' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  <span className='hl-pulse-dot' />
                  {t('Anthropic 官方通道')}
                </Tag>
                <Tag color='green' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  {t('智能缓存降本')}
                </Tag>
                <Tag color='orange' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  {t('支持企业采购')}
                </Tag>
              </div>

              {/* 主标题：渐变动画文字 */}
              <div style={anim('hl-fade-up 0.7s ease', 0.18)}>
                <Title
                  heading={1}
                  className={`!mb-5 !text-2xl !font-black !leading-[1.05] sm:!text-4xl md:!text-5xl lg:!text-6xl ${isChinese ? 'tracking-[-0.03em]' : ''}`}
                >
                  <span className='hl-gradient-text'>
                    {t('企业级 Claude API 官方通道中转')}
                  </span>
                </Title>
              </div>

              {/* 副标题 */}
              <div style={anim('hl-fade-up 0.7s ease', 0.32)}>
                <Paragraph className='!mb-0 max-w-3xl !text-base !leading-7 !text-semi-color-text-1 md:!text-lg'>
                  {t('仅接 Anthropic 官方通道，不走逆向。智能缓存命中超 80%，比直连官方节省 60%+ Token 成本，兼容官方 API 接入方式，并支持企业开具正规增值税发票。')}
                </Paragraph>
              </div>

              {/* 特性 chips */}
              <div
                className='mt-6 flex flex-wrap gap-3 text-sm text-semi-color-text-1'
                style={anim('hl-fade-up 0.6s ease', 0.44)}
              >
                {[
                  t('仅接 Anthropic 官方通道'),
                  t('兼容官方 API，零代码迁移'),
                  t('支持正规增值税发票'),
                ].map((text) => (
                  <span
                    key={text}
                    className='hl-chip-hover inline-flex items-center gap-2 rounded-full border border-semi-color-border bg-white/70 px-3 py-1.5 backdrop-blur dark:bg-white/5'
                  >
                    <IconTickCircle className='text-emerald-500' />
                    {text}
                  </span>
                ))}
              </div>

              {/* CTA 按钮 */}
              <div
                className='mt-8 flex flex-wrap items-center gap-4'
                style={anim('hl-fade-up 0.6s ease', 0.54)}
              >
                <Link to='/pricing'>
                  <Button
                    theme='solid'
                    type='primary'
                    size={isMobile ? 'default' : 'large'}
                    className='!rounded-full !px-7'
                    icon={<IconPlay />}
                  >
                    {t('价格方案')}
                  </Button>
                </Link>
                {isDemoSiteMode && version ? (
                  <Button
                    size={isMobile ? 'default' : 'large'}
                    className='!rounded-full !px-6'
                    onClick={() =>
                      window.open('https://github.com/QuantumNous/new-api', '_blank')
                    }
                  >
                    {version}
                  </Button>
                ) : (
                  docsLink && (
                    <Button
                      size={isMobile ? 'default' : 'large'}
                      className='!rounded-full !px-6'
                      icon={<IconFile />}
                      onClick={() => window.open(docsLink + '/start', '_blank')}
                    >
                      {t('Claude 接入文档')}
                    </Button>
                  )
                )}
              </div>

              {/* 统计数字（计数动画） */}
              <div
                className='mt-10 grid grid-cols-3 gap-3'
                style={anim('hl-fade-up 0.6s ease', 0.68)}
              >
                {stats.map((item) => (
                  <div
                    key={item.label}
                    className='hl-stat-hover rounded-3xl border border-semi-color-border bg-white/75 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur dark:bg-white/5 sm:p-5'
                  >
                    <div className='text-xl font-black text-semi-color-text-0 sm:text-2xl md:text-3xl'>
                      {item.value}
                    </div>
                    <div className='mt-2 text-sm text-semi-color-text-2'>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 右侧：接入卡片（从右滑入） */}
            <div
              className='relative z-[1]'
              style={anim('hl-slide-right 0.85s cubic-bezier(0.16,1,0.3,1)', 0.25)}
            >
              <div className='hl-card-hover rounded-[24px] border border-semi-color-border bg-white/85 p-4 shadow-[0_32px_120px_rgba(14,165,233,0.18)] backdrop-blur dark:bg-[#0b1120]/80 sm:rounded-[32px] sm:p-6'>
                <div className='mb-5 flex items-start justify-between gap-4'>
                  <div>
                    <Text className='!text-xs !font-semibold !uppercase !tracking-[0.2em] !text-cyan-600 dark:!text-cyan-300'>
                      {t('Base URL')}
                    </Text>
                    <Title heading={4} className='!mb-0 !mt-2'>
                      {t('仅接 Anthropic 官方通道')}
                    </Title>
                  </div>
                </div>

                <Paragraph className='!mb-5 !text-sm !leading-6 !text-semi-color-text-1'>
                  {t('无需重写业务逻辑，保留原有官方 SDK 和请求格式，替换 Base URL 与 Key 后即可开始调用。')}
                </Paragraph>

                <Input
                  readonly
                  value={serverAddress}
                  className='!rounded-2xl'
                  size={isMobile ? 'default' : 'large'}
                  suffix={
                    <div className='flex items-center gap-2'>
                      <div className='hidden sm:block'>
                        <ScrollList
                          bodyHeight={32}
                          style={{ border: 'unset', boxShadow: 'unset' }}
                        >
                          <ScrollItem
                            mode='wheel'
                            cycled={true}
                            list={endpointItems}
                            selectedIndex={endpointIndex}
                            onSelect={({ index }) => setEndpointIndex(index)}
                          />
                        </ScrollList>
                      </div>
                      <Button
                        type='primary'
                        onClick={handleCopyBaseURL}
                        icon={<IconCopy />}
                        className='!rounded-xl'
                        aria-label={t('复制基址')}
                      />
                    </div>
                  }
                />

                <div className='mt-6 space-y-3'>
                  {trustCardItems.map((item) => (
                    <div
                      key={item.title}
                      className='hl-trust-hover rounded-2xl border border-semi-color-border bg-semi-color-bg-0/80 p-4 dark:bg-white/[0.03]'
                    >
                      <div className='flex items-start gap-3'>
                        <div className='mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-200'>
                          {item.icon}
                        </div>
                        <div>
                          <div className='font-semibold text-semi-color-text-0'>{item.title}</div>
                          <div className='mt-1 text-sm leading-6 text-semi-color-text-2'>
                            {item.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Subscription marketing ── */}
      <section
        id='package-mode-section'
        className='mx-auto w-full max-w-[1280px] px-4 py-10 md:px-6 md:py-14 lg:px-8'
      >
        <div className='overflow-hidden rounded-[28px] border border-semi-color-border bg-[linear-gradient(135deg,rgba(59,130,246,0.06),rgba(16,185,129,0.05)_42%,rgba(255,255,255,0.92))] shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur sm:rounded-[32px]'>
          <div className='grid gap-10 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:items-center'>
            <div className='relative z-[1]'>
              <div className='mb-5 flex flex-wrap items-center gap-3'>
                <Tag color='red' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  {t('人工发放')}
                </Tag>
                <Tag color='cyan' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  {t('Claude / Codex 套餐')}
                </Tag>
                <Tag color='green' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  {t('更适合长期用')}
                </Tag>
              </div>

              <Title
                heading={2}
                className={`!mb-5 !max-w-3xl !text-2xl !font-black !leading-[1.1] sm:!text-4xl ${isChinese ? 'tracking-[-0.03em]' : ''}`}
              >
                <span className='hl-gradient-text'>
                  {t('Claude / Codex 套餐，便宜量大，长期用更划算')}
                </span>
              </Title>

              <Paragraph className='!mb-0 max-w-3xl !text-base !leading-7 !text-semi-color-text-1 md:!text-lg'>
                {t('当前所有 Claude 系列月卡五折。以 Claude Lite 为例，低至一天不到 5 块钱，500 次/天，月共 15000 次，支付成功后自动生效，适合长期稳定调用。')}
              </Paragraph>

              <div className='mt-6 flex flex-wrap gap-3 text-sm text-semi-color-text-1'>
                {[
                  t('天卡、轻量包、月卡都能快速上手'),
                  t('支付后进入待发放状态'),
                  t('适合个人开发者与小团队持续调用'),
                ].map((text) => (
                  <span
                    key={text}
                    className='hl-chip-hover inline-flex items-center gap-2 rounded-full border border-semi-color-border bg-white/70 px-3 py-1.5 backdrop-blur dark:bg-white/5'
                  >
                    <IconTickCircle className='text-emerald-500' />
                    {text}
                  </span>
                ))}
              </div>

              <div className='mt-8 flex flex-wrap items-center gap-4'>
                <Link to='/pricing?currency=CNY&plan_series=all'>
                  <Button
                    theme='solid'
                    type='primary'
                    size={isMobile ? 'default' : 'large'}
                    className='!rounded-full !px-7'
                  >
                    {t('查看全部套餐')}
                  </Button>
                </Link>
                <Link to='/pricing?currency=CNY&vendor=Anthropic'>
                  <Button
                    size={isMobile ? 'default' : 'large'}
                    className='!rounded-full !px-7'
                  >
                    {t('先看 Claude 系列')}
                  </Button>
                </Link>
              </div>

              <div className='mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3'>
                {[
                  {
                    value: t('轻量起步'),
                    label: t('天卡、轻量包、月卡都能快速上手'),
                  },
                  {
                    value: t('人工发放'),
                    label: t('支付后进入待发放状态'),
                  },
                  {
                    value: t('更适合长期用'),
                    label: t('适合个人开发者与小团队持续调用'),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className='hl-stat-hover rounded-3xl border border-semi-color-border bg-white/75 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur dark:bg-white/5 sm:p-5'
                  >
                    <div className='text-lg font-black text-semi-color-text-0 sm:text-xl'>
                      {item.value}
                    </div>
                    <div className='mt-2 text-sm leading-6 text-semi-color-text-2'>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className='relative z-[1]'>
              <div className='hl-card-hover rounded-[24px] border border-semi-color-border bg-white/85 p-4 shadow-[0_32px_120px_rgba(59,130,246,0.12)] backdrop-blur dark:bg-[#0b1120]/80 sm:rounded-[32px] sm:p-6'>
                <div className='mb-5 flex items-start justify-between gap-4'>
                  <div>
                    <Text className='!text-xs !font-semibold !uppercase !tracking-[0.2em] !text-cyan-600 dark:!text-cyan-300'>
                      {t('按次套餐')}
                    </Text>
                    <Title heading={4} className='!mb-0 !mt-2'>
                      {t('按套餐明细结算')}
                    </Title>
                  </div>
                  <div className='rounded-2xl bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-200'>
                    {t('人工发放')}
                  </div>
                </div>

                <Paragraph className='!mb-5 !text-sm !leading-6 !text-semi-color-text-1'>
                  {t('以套餐配置为准')}
                </Paragraph>

                <div className='space-y-3'>
                  {hotSubscriptionItems.map((item) => (
                    <div
                      key={item.title}
                      className='hl-trust-hover rounded-2xl border border-semi-color-border bg-semi-color-bg-0/80 p-4 dark:bg-white/[0.03]'
                    >
                      <div className='flex items-start gap-3'>
                        <div className='mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-200'>
                          {item.icon}
                        </div>
                        <div>
                          <div className='text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300'>
                            {item.badge}
                          </div>
                          <div className='mt-2 font-semibold text-semi-color-text-0'>
                            {item.title}
                          </div>
                          <div className='mt-1 text-sm leading-6 text-semi-color-text-2'>
                            {item.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className='mx-auto w-full max-w-[1280px] px-4 py-4 md:px-6 md:py-6 lg:px-8'>
        <div className='rounded-[28px] border border-semi-color-border bg-[linear-gradient(135deg,rgba(6,182,212,0.07),rgba(255,255,255,0.96)_38%,rgba(16,185,129,0.06))] p-5 shadow-[0_20px_64px_rgba(15,23,42,0.05)] sm:rounded-[32px] sm:p-7'>
          <div className='mx-auto max-w-3xl text-center'>
            <Text className='!text-xs !font-semibold !uppercase !tracking-[0.24em] !text-cyan-600 dark:!text-cyan-300'>
              {t('开发者怎么说')}
            </Text>
            <Title heading={2} className='!mb-3 !mt-4'>
              {t('不是功能写得多，而是买完真的更省事')}
            </Title>
            <Paragraph className='!mb-0 !text-base !leading-7 !text-semi-color-text-1'>
              {t('这些反馈，基本就是为什么很多人不再临时按量买，而是直接上 Claude / Codex 套餐或官方直连。')}
            </Paragraph>
          </div>

          <div className='mt-5 flex flex-wrap justify-center gap-3 text-sm text-semi-color-text-1'>
            {[
              t('买完就能接，不用自己反复试链路'),
              t('对长期用的人来说，稳定、省时间，比单次便宜更重要'),
              t('先买套餐跑通，再按需要升级'),
            ].map((text) => (
              <span
                key={text}
                className='hl-chip-hover inline-flex items-center gap-2 rounded-full border border-semi-color-border bg-white/70 px-3 py-1.5 backdrop-blur dark:bg-white/5'
              >
                <IconTickCircle className='text-emerald-500' />
                {text}
              </span>
            ))}
          </div>

          <div className='mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4'>
            {testimonials.map((item) => (
              <div
                key={item.quote}
                className='hl-card-hover rounded-[24px] border border-semi-color-border bg-semi-color-bg-0/90 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.05)]'
              >
                <div className='text-3xl font-black leading-none text-cyan-500/70'>"</div>
                <Paragraph className='!mb-0 !mt-3 !text-sm !leading-7 !text-semi-color-text-1'>
                  {item.quote}
                </Paragraph>
                <div className='mt-5 flex items-center gap-3'>
                  <div className='flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500/10 text-sm font-bold text-cyan-700 dark:text-cyan-200'>
                    {item.name}
                  </div>
                  <div>
                    <div className='font-semibold text-semi-color-text-0'>{item.name}</div>
                    <div className='text-sm text-semi-color-text-2'>{item.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Provider logos（滚动显示） ── */}
      <section className='border-y border-semi-color-border bg-semi-color-fill-0/40'>
        <div
          ref={providerRef}
          className='mx-auto w-full max-w-[1280px] px-4 py-10 md:px-6 md:py-16 lg:px-8'
        >
          <div
            className={`hl-reveal mx-auto max-w-3xl text-center ${providerInView ? 'hl-in' : ''}`}
          >
            <Text className='!text-xs !font-semibold !uppercase !tracking-[0.24em] !text-cyan-600 dark:!text-cyan-300'>
              {t('Claude 官方通道')}
            </Text>
            <Title heading={2} className='!mb-3 !mt-4'>
              {t('企业级 Claude API 为核心，兼容常用模型生态')}
            </Title>
            <Paragraph className='!mb-0 !text-base !leading-7 !text-semi-color-text-1'>
              {t('优先提供稳定的 Claude 官方通道接入，同时兼容 GPT、Gemini 等常用模型，满足团队在一个平台内统一管理多模型调用的需求。')}
            </Paragraph>
          </div>

          <div
            className={`hl-reveal mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4 md:gap-6 lg:gap-8 ${providerInView ? 'hl-in' : ''}`}
            style={{ transitionDelay: '0.15s' }}
          >
            <Suspense fallback={null}>
              <ProviderLogos />
            </Suspense>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DesktopHomeLanding;
