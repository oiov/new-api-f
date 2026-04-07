'use client';

import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { Shield, Zap, CheckCircle2, Lock } from 'lucide-react';
import { useSystemStatus } from '@/context/status-context';
import { getLogo, getSystemName } from '@/lib/utils';

const FEATURES = [
  { icon: Shield,       key: '企业级安全，数据全程加密传输', iconBg: 'bg-white/15', iconColor: 'text-white' },
  { icon: Zap,          key: '支持 40+ 主流大模型，统一接入', iconBg: 'bg-white/15', iconColor: 'text-white' },
  { icon: CheckCircle2, key: '稳定可靠，99.9% SLA 保障',    iconBg: 'bg-white/15', iconColor: 'text-white' },
] as const;

const STATS = [
  { value: '40+',  label: '供应商' },
  { value: '99.9%', label: 'SLA' },
  { value: '24/7',  label: '技术支持' },
] as const;

interface BrandPanelProps {
  headline: string;
  subHeadline: string;
  description: string;
}

export function BrandPanel({ headline, subHeadline, description }: BrandPanelProps) {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const systemName = getSystemName(status);
  const logoUrl = getLogo(status);

  return (
    <div className="relative hidden lg:flex flex-col justify-between p-10 overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-[oklch(0.32_0.20_265)]">

      {/* ── 背景装饰 ── */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {/* 主光晕 */}
        <div className="absolute top-0 right-0 w-[520px] h-[520px] rounded-full bg-white/[0.06] blur-3xl -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-white/[0.04] blur-2xl translate-y-1/3 -translate-x-1/4" />
        {/* 中心微光 */}
        <div className="absolute top-1/2 left-1/2 w-80 h-80 rounded-full bg-white/[0.025] blur-xl -translate-x-1/2 -translate-y-1/2" />

        {/* 点阵网格 */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="brand-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#brand-grid)" />
        </svg>

        {/* 顶部光线 */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)' }}
        />
        {/* 底部渐变遮罩 */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/3"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.18), transparent)' }}
        />
      </div>

      {/* ── Logo ── */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="size-11 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20 shadow-lg">
          <Image src={logoUrl} alt={systemName} width={26} height={26} className="object-contain" />
        </div>
        <div>
          <span className="text-white font-bold text-lg tracking-tight leading-none">{systemName}</span>
          <p className="text-white/50 text-[11px] mt-0.5">{t('统一 AI API 网关')}</p>
        </div>
      </div>

      {/* ── 主文案 ── */}
      <div className="relative z-10 space-y-8">
        <div className="space-y-3">
          <h2 className="text-[2.1rem] font-bold text-white leading-tight tracking-tight">
            {t(headline)}
            <br />
            <span className="text-white/70 font-semibold">{t(subHeadline)}</span>
          </h2>
          <p className="text-white/55 text-sm leading-relaxed max-w-xs">
            {t(description)}
          </p>
        </div>

        {/* 功能列表 */}
        <ul className="space-y-3">
          {FEATURES.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-center gap-3">
              <div className="size-8 rounded-xl bg-white/12 backdrop-blur-sm border border-white/15 flex items-center justify-center shrink-0 shadow-sm">
                <Icon className="size-3.5 text-white" />
              </div>
              <span className="text-white/80 text-sm">{t(key)}</span>
            </li>
          ))}
        </ul>

        {/* 数据胶囊 */}
        <div className="flex gap-2.5 flex-wrap">
          {STATS.map(({ value, label }) => (
            <div
              key={label}
              className="flex items-baseline gap-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 px-3.5 py-1.5"
            >
              <span className="text-white font-bold text-sm tabular-nums">{value}</span>
              <span className="text-white/55 text-xs">{t(label)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 底部安全标识 ── */}
      <div className="relative z-10 flex items-center gap-2 text-white/40 text-xs">
        <Lock className="size-3 shrink-0" />
        <span>{t('SSL 安全加密连接 · 数据不出境')}</span>
      </div>
    </div>
  );
}
