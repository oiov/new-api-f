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

const subscriptionMarketingItems = (t) => [
  {
    badge: t('Claude 热卖'),
    title: t('Claude Lite / Mini Plus / Premium+ 持续热销'),
    description: t('适合长期稳定写代码、日常对话、团队协作与高频 API 调用场景，很多用户会直接从轻量套餐一路升级到月卡。'),
  },
  {
    badge: t('Codex 增长快'),
    title: t('Codex 系列更适合高强度开发与自动化场景'),
    description: t('如果你需要更激进的代码生成、修复与批量执行能力，可以直接选择 Codex 套餐，单价和稳定性都更适合重度开发者。'),
  },
  {
    badge: t('代发放更省心'),
    title: t('购买成功后自动走发放链路，适合不会折腾配置的用户'),
    description: t('Claude 系列代发放完成后会自动创建 Subscription Access Key、发送激活测试消息，并通过邮件和站内信提醒你开始使用。'),
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
  const stats = [
    { value: `${count1}%`, label: t('官方 API 通道') },
    { value: `>${count2}%`, label: t('缓存命中率') },
    { value: `${count3}%+`, label: t('Token 成本节省') },
  ];

  const anim = (name, delay) =>
    heroReady
      ? { animation: `${name} both`, animationDelay: `${delay}s` }
      : { opacity: 0 };

  return (
    <div className='w-full overflow-x-hidden'>
      {/* ── Hero ── */}
      <section className='relative overflow-hidden border-b border-semi-color-border'>
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
                <Link to='/console'>
                  <Button
                    size={isMobile ? 'default' : 'large'}
                    className='!rounded-full !px-7'
                    icon={<IconBolt />}
                  >
                    {t('立即获取 API 地址')}
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
                      {t('保留官方调用方式，快速切到生产环境')}
                    </Title>
                  </div>
                  <div className='rounded-2xl bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-200'>
                    {t('企业级可用')}
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
      <section className='mx-auto w-full max-w-[1280px] px-4 py-10 md:px-6 md:py-14 lg:px-8'>
        <div className='overflow-hidden rounded-[28px] border border-semi-color-border bg-[linear-gradient(135deg,rgba(6,182,212,0.08),rgba(249,115,22,0.08)_58%,rgba(255,255,255,0.88))] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur sm:rounded-[32px] sm:p-7'>
          <div className='grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-start'>
            <div className='space-y-4'>
              <Tag color='red' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                {t('订阅套餐正在热卖')}
              </Tag>
              <Title heading={2} className='!mb-0 !max-w-xl !leading-[1.15]'>
                {t('很多用户现在不是先试模型价格，而是直接买 Claude / Codex 套餐')}
              </Title>
              <Paragraph className='!mb-0 !max-w-2xl !text-base !leading-7 !text-semi-color-text-1'>
                {t('原因很直接：价格更稳、额度更清楚、发放链路更省心。对持续使用 Claude 或 Codex 的用户来说，套餐制已经比临时按量计费更容易下单。')}
              </Paragraph>

              <div className='grid gap-3 sm:grid-cols-3'>
                {[
                  {
                    value: t('轻量起步'),
                    label: t('天卡、轻量包、月卡都能快速上手'),
                  },
                  {
                    value: t('自动发放'),
                    label: t('成功后自动创建可用 Key 并通知'),
                  },
                  {
                    value: t('更适合长期用'),
                    label: t('适合个人开发者与小团队持续调用'),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className='rounded-2xl border border-white/60 bg-white/75 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]'
                  >
                    <div className='text-sm font-bold text-semi-color-text-0'>
                      {item.value}
                    </div>
                    <div className='mt-2 text-xs leading-6 text-semi-color-text-2'>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className='flex flex-wrap gap-3 pt-1'>
                <Link to='/pricing?currency=CNY&plan_series=all'>
                  <Button
                    theme='solid'
                    type='primary'
                    size={isMobile ? 'default' : 'large'}
                    className='!rounded-full !px-7'
                  >
                    {t('去看热卖订阅套餐')}
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
            </div>

            <div className='grid gap-4 md:grid-cols-3 xl:grid-cols-1'>
              {hotSubscriptionItems.map((item) => (
                <div
                  key={item.title}
                  className='rounded-[24px] border border-semi-color-border bg-white/82 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.05)] backdrop-blur'
                >
                  <div className='mb-3 flex items-center gap-2'>
                    <span className='inline-flex h-2.5 w-2.5 rounded-full bg-cyan-500' />
                    <Text className='!text-xs !font-semibold !uppercase !tracking-[0.18em] !text-cyan-700'>
                      {item.badge}
                    </Text>
                  </div>
                  <Title heading={5} className='!mb-2 !leading-6'>
                    {item.title}
                  </Title>
                  <Paragraph className='!mb-0 !text-sm !leading-6 !text-semi-color-text-2'>
                    {item.description}
                  </Paragraph>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature cards（滚动显示 + 悬停浮起） ── */}
      <section className='mx-auto w-full max-w-[1280px] px-4 py-10 md:px-6 md:py-16 lg:px-8'>
        <div ref={featRef} className='grid gap-5 md:grid-cols-3'>
          {featureCardItems.map((item, i) => (
            <div
              key={item.title}
              className={`hl-card-hover hl-reveal rounded-[20px] border border-semi-color-border bg-semi-color-bg-0 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.25)] sm:rounded-[28px] sm:p-6 ${featInView ? 'hl-in' : ''}`}
              style={{ transitionDelay: `${i * 0.12}s` }}
            >
              <div className='mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-200'>
                {item.icon}
              </div>
              <Title heading={5} className='!mb-2'>
                {item.title}
              </Title>
              <Paragraph className='!mb-0 !text-sm !leading-6 !text-semi-color-text-2'>
                {item.description}
              </Paragraph>
            </div>
          ))}
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
