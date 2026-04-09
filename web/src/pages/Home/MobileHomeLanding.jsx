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

import React from 'react';
import { Button, Input, Tag, Typography } from '@douyinfe/semi-ui';
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

const { Text, Title, Paragraph } = Typography;

const PROVIDER_NAMES = [
  'Claude',
  'OpenAI',
  'Gemini',
  'DeepSeek',
  'Qwen',
  'Grok',
  'Moonshot',
  'Minimax',
];

const MobileHomeLanding = ({
  t,
  isChinese,
  serverAddress,
  handleCopyBaseURL,
  docsLink,
  isDemoSiteMode,
  version,
}) => {
  const trustItems = [
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

  const featureItems = [
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

  const stats = [
    { value: '100%', label: t('官方 API 通道') },
    { value: '>80%', label: t('缓存命中率') },
    { value: '60%+', label: t('Token 成本节省') },
  ];

  return (
    <div className='w-full overflow-x-hidden'>
      <section className='border-b border-semi-color-border bg-semi-color-bg-0'>
        <div className='mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 pb-10 pt-16'>
          <div className='flex flex-wrap items-center gap-3'>
            <Tag color='cyan' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
              {t('Anthropic 官方通道')}
            </Tag>
            <Tag color='green' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
              {t('智能缓存降本')}
            </Tag>
            <Tag color='orange' shape='circle' className='!px-3 !py-1 !text-xs !font-semibold'>
              {t('支持企业采购')}
            </Tag>
          </div>

          <div>
            <Title
              heading={1}
              className={`!mb-5 !text-3xl !font-black !leading-[1.08] sm:!text-4xl ${isChinese ? 'tracking-[-0.03em]' : ''}`}
            >
              <span className='hl-gradient-text'>
                {t('企业级 Claude API 官方通道中转')}
              </span>
            </Title>
            <Paragraph className='!mb-0 !text-base !leading-7 !text-semi-color-text-1'>
              {t('仅接 Anthropic 官方通道，不走逆向。智能缓存命中超 80%，比直连官方节省 60%+ Token 成本，兼容官方 API 接入方式，并支持企业开具正规增值税发票。')}
            </Paragraph>
          </div>

          <div className='flex flex-wrap gap-3 text-sm text-semi-color-text-1'>
            {[
              t('仅接 Anthropic 官方通道'),
              t('兼容官方 API，零代码迁移'),
              t('支持正规增值税发票'),
            ].map((text) => (
              <span
                key={text}
                className='inline-flex items-center gap-2 rounded-full border border-semi-color-border bg-semi-color-fill-0 px-3 py-1.5'
              >
                <IconTickCircle className='text-emerald-500' />
                {text}
              </span>
            ))}
          </div>

          <div className='flex flex-wrap items-center gap-4'>
            <Link to='/pricing'>
              <Button
                theme='solid'
                type='primary'
                className='!rounded-full !px-7'
                icon={<IconPlay />}
              >
                {t('价格方案')}
              </Button>
            </Link>
            <Link to='/console'>
              <Button className='!rounded-full !px-7' icon={<IconBolt />}>
                {t('立即获取 API 地址')}
              </Button>
            </Link>
            {isDemoSiteMode && version ? (
              <Button
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
                  className='!rounded-full !px-6'
                  icon={<IconFile />}
                  onClick={() => window.open(docsLink + '/start', '_blank')}
                >
                  {t('Claude 接入文档')}
                </Button>
              )
            )}
          </div>

          <div className='grid grid-cols-3 gap-3'>
            {stats.map((item) => (
              <div
                key={item.label}
                className='rounded-3xl border border-semi-color-border bg-semi-color-bg-0 p-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)]'
              >
                <div className='text-xl font-black text-semi-color-text-0'>{item.value}</div>
                <div className='mt-2 text-sm text-semi-color-text-2'>{item.label}</div>
              </div>
            ))}
          </div>

          <div className='rounded-[24px] border border-semi-color-border bg-semi-color-bg-0 p-4 shadow-[0_16px_48px_rgba(14,165,233,0.12)]'>
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
              suffix={
                <Button
                  type='primary'
                  onClick={handleCopyBaseURL}
                  icon={<IconCopy />}
                  className='!rounded-xl'
                  aria-label={t('复制基址')}
                />
              }
            />

            <div className='mt-6 space-y-3'>
              {trustItems.map((item) => (
                <div
                  key={item.title}
                  className='rounded-2xl border border-semi-color-border bg-semi-color-fill-0 p-4'
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
      </section>

      <section className='mx-auto w-full max-w-[1280px] px-4 py-10'>
        <div className='grid gap-5'>
          {featureItems.map((item) => (
            <div
              key={item.title}
              className='rounded-[20px] border border-semi-color-border bg-semi-color-bg-0 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]'
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

      <section className='border-y border-semi-color-border bg-semi-color-fill-0/40'>
        <div className='mx-auto w-full max-w-[1280px] px-4 py-10'>
          <div className='mx-auto max-w-3xl text-center'>
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

          <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
            {PROVIDER_NAMES.map((name) => (
              <span
                key={name}
                className='rounded-full border border-semi-color-border bg-semi-color-bg-0 px-4 py-2 text-sm font-medium text-semi-color-text-1'
              >
                {name}
              </span>
            ))}
            <span className='rounded-full border border-semi-color-border bg-semi-color-bg-0 px-4 py-2 text-sm font-semibold text-semi-color-text-0'>
              {t('30+')}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default MobileHomeLanding;
