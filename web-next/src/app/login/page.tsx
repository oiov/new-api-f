'use client';

import React from 'react';
import { AuthRedirect } from '@/components/common/auth-guard';
import { BrandPanel } from '@/components/auth/brand-panel';
import { LoginForm } from './components/login-form';

export default function LoginPage() {
  return (
    <AuthRedirect>
      <div className="min-h-[calc(100vh-var(--header-height))] grid lg:grid-cols-[45%_55%]">

        {/* 左侧品牌面板 */}
        <BrandPanel
          headline="统一的 AI API"
          subHeadline="接入平台"
          description="一个账号，接入所有主流大模型，让 AI 开发更简单。"
        />

        {/* 右侧表单区域 */}
        <div className="flex items-center justify-center px-6 py-12 bg-background">
          <div className="w-full max-w-sm">
            {/* 表单卡片容器 */}
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm px-8 py-8">
              <LoginForm />
            </div>
          </div>
        </div>

      </div>
    </AuthRedirect>
  );
}
