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
    if (!trigger) return;
    let startTime = null;
    const step = (ts) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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

const DefaultHomeLanding = ({
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
  // Hero 入场动画触发（50ms 延迟确保首次 paint 后开始）
  const [heroReady, setHeroReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setHeroReady(true), 50);
    return () => clearTimeout(id);
  }, []);

  // 统计数字递增
  const count1 = useCountUp(100, 1200, heroReady);
  const count2 = useCountUp(80, 1500, heroReady);
  const count3 = useCountUp(60, 1800, heroReady);

  // 滚动显示 ref
  const [featRef, featInView] = useInView(0.1);
  const [providerRef, providerInView] = useInView(0.1);

  // 入场动画 helper
  const anim = (name, delay) =>
    heroReady
      ? { animation: `${name} both`, animationDelay: `${delay}s` }
      : { opacity: 0 };

  const trustItems = [
    {
      icon: <IconShield size='large' />,
      title: t('100% 官方 Anthropic 通道'),
      description: t('直连 Anthropic 官方 API，绝不使用逆向。每次请求均走官方链路，数据安全，服务稳定无忧。'),
    },
    {
      icon: <IconBolt size='large' />,
      title: t('智能缓存，节省 60%+ 成本'),
      description: t('缓存命中率超 80%，命中部分按缓存价格计费，有效降低 Token 费用，无需任何额外配置。'),
    },
    {
      icon: <IconBriefcase size='large' />,
      title: t('支持开具增值税发票'),
      description: t('满足企业财务合规需求，支持正规采购流程与对账协同，B2B 合作无障碍。'),
    },
  ];

  const featureItems = [
    {
      icon: <IconServer size='large' />,
      title: t('零代码迁移，3 步完成接入'),
      description: t('完全兼容官方 API 格式，更换 Base URL、设置 API Key 即可开始使用，无需改动任何业务代码。'),
    },
    {
      icon: <IconActivity size='large' />,
      title: t('企业级高可用 SLA'),
      description: t('高可用服务保障，专属技术支持通道，确保业务连续性不受影响。'),
    },
    {
      icon: <IconSafe size='large' />,
      title: t('透明计费，用量越大折扣越高'),
      description: t('计费模式与官方完全一致，企业专属折扣价格，用量越大优惠越多，账单清晰可查。'),
    },
  ];

  const stats = [
    { value: `${count1}%`, label: t('官方 API 通道') },
    { value: `>${count2}%`, label: t('缓存命中率') },
    { value: `${count3}%+`, label: t('Token 成本节省') },
  ];

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
                  {t('100% 官方通道')}
                </Tag>
                <Tag color='green' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  {t('缓存命中 >80%')}
                </Tag>
                <Tag color='orange' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
                  {t('可开增值税发票')}
                </Tag>
              </div>

              {/* 主标题：渐变动画文字 */}
              <div style={anim('hl-fade-up 0.7s ease', 0.18)}>
                <Title
                  heading={1}
                  className={`!mb-5 !text-2xl !font-black !leading-[1.05] sm:!text-4xl md:!text-5xl lg:!text-6xl ${isChinese ? 'tracking-[-0.03em]' : ''}`}
                >
                  <span className='hl-gradient-text'>
                    {t('官方 Claude API · 成本降低 60%+')}
                  </span>
                </Title>
              </div>

              {/* 副标题 */}
              <div style={anim('hl-fade-up 0.7s ease', 0.32)}>
                <Paragraph className='!mb-0 max-w-3xl !text-base !leading-7 !text-semi-color-text-1 md:!text-lg'>
                  {t('仅接 Anthropic 官方通道，不走逆向。智能缓存命中超 80%，比直连官方节省 60%+ Token 费用，支持企业开具正规增值税发票。')}
                </Paragraph>
              </div>

              {/* 特性 chips */}
              <div
                className='mt-6 flex flex-wrap gap-3 text-sm text-semi-color-text-1'
                style={anim('hl-fade-up 0.6s ease', 0.44)}
              >
                {[
                  t('仅接官方，不做逆向'),
                  t('节省 60%+ Token 成本'),
                  t('支持开具正规增值税发票'),
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
                    {t('查看接入方案')}
                  </Button>
                </Link>
                <Link to='/console'>
                  <Button
                    size={isMobile ? 'default' : 'large'}
                    className='!rounded-full !px-7'
                    icon={<IconBolt />}
                  >
                    {t('立即获取密钥')}
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
                      {t('开发文档')}
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
                      {t('10 分钟完成接入切换')}
                    </Title>
                  </div>
                  <div className='rounded-2xl bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-200'>
                    {t('生产可用')}
                  </div>
                </div>

                <Paragraph className='!mb-5 !text-sm !leading-6 !text-semi-color-text-1'>
                  {t('完全兼容官方 API，仅需更换 Base URL，零代码改动即可接入。')}
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
                  {trustItems.map((item) => (
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

      {/* ── Feature cards（滚动显示 + 悬停浮起） ── */}
      <section className='mx-auto w-full max-w-[1280px] px-4 py-10 md:px-6 md:py-16 lg:px-8'>
        <div ref={featRef} className='grid gap-5 md:grid-cols-3'>
          {featureItems.map((item, i) => (
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
              {t('多模型接入')}
            </Text>
            <Title heading={2} className='!mb-3 !mt-4'>
              {t('以 Claude 为核心，同时支持接入主流模型生态')}
            </Title>
            <Paragraph className='!mb-0 !text-base !leading-7 !text-semi-color-text-1'>
              {t('一套平台统一管理所有模型 API，无缝接入 GPT、Gemini 等主流模型，无需多个账号和密钥。')}
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

export default DefaultHomeLanding;
