'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Save, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { AuthGuard } from '@/components/common/auth-guard';
import { API } from '@/lib/api';
import { toast } from 'sonner';

type OptionMap = Record<string, string>;

function toBoolean(str: string | undefined): boolean {
  return str === 'true';
}

function SettingContent() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<OptionMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option');
      const data = res.data as { success: boolean; data: { key: string; value: string }[] };
      if (data.success) {
        const map: OptionMap = {};
        (Array.isArray(data.data) ? data.data : []).forEach((item) => {
          map[item.key] = item.value;
        });
        setOptions(map);
      }
    } catch {
      toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const updateOption = async (key: string, value: string) => {
    try {
      const res = await API.put('/api/option', { key, value });
      const data = res.data as { success: boolean; message?: string };
      if (!data.success) {
        toast.error(data.message || t('保存失败'));
        return false;
      }
      return true;
    } catch {
      toast.error(t('保存失败'));
      return false;
    }
  };

  const handleSaveOptions = async (keys: string[]) => {
    setSaving(true);
    try {
      const promises = keys.map((key) => updateOption(key, options[key] ?? ''));
      const results = await Promise.all(promises);
      if (results.every(Boolean)) {
        toast.success(t('保存成功'));
      }
    } finally {
      setSaving(false);
    }
  };

  const setOption = (key: string, value: string) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const setBoolOption = (key: string, value: boolean) => {
    setOptions((prev) => ({ ...prev, [key]: String(value) }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="size-6" />
          {t('系统设置')}
        </h1>
        <Button variant="outline" size="sm" onClick={loadOptions} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('刷新')}
        </Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="general">{t('通用设置')}</TabsTrigger>
          <TabsTrigger value="auth">{t('认证设置')}</TabsTrigger>
          <TabsTrigger value="operation">{t('运营设置')}</TabsTrigger>
          <TabsTrigger value="quota">{t('额度设置')}</TabsTrigger>
          <TabsTrigger value="payment">{t('支付设置')}</TabsTrigger>
        </TabsList>

        {/* 通用设置 */}
        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('基本信息')}</CardTitle>
              <CardDescription>{t('系统名称、Logo等基本信息')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('系统名称')}</Label>
                <Input
                  value={options['SystemName'] ?? ''}
                  onChange={(e) => setOption('SystemName', e.target.value)}
                  placeholder="fishxcode"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Logo URL')}</Label>
                <Input
                  value={options['Logo'] ?? ''}
                  onChange={(e) => setOption('Logo', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label>{t('首页内容 (URL 或 Markdown)')}</Label>
                <Textarea
                  value={options['HomePageContent'] ?? ''}
                  onChange={(e) => setOption('HomePageContent', e.target.value)}
                  placeholder={t('留空使用默认首页')}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('关于页面内容')}</Label>
                <Textarea
                  value={options['About'] ?? ''}
                  onChange={(e) => setOption('About', e.target.value)}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('页脚内容 (HTML)')}</Label>
                <Textarea
                  value={options['Footer'] ?? ''}
                  onChange={(e) => setOption('Footer', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('公告')}</Label>
                <Textarea
                  value={options['Notice'] ?? ''}
                  onChange={(e) => setOption('Notice', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('充值链接')}</Label>
                <Input
                  value={options['TopUpLink'] ?? ''}
                  onChange={(e) => setOption('TopUpLink', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label>{t('文档链接')}</Label>
                <Input
                  value={options['DocsLink'] ?? ''}
                  onChange={(e) => setOption('DocsLink', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <Button
                onClick={() => handleSaveOptions(['SystemName', 'Logo', 'HomePageContent', 'About', 'Footer', 'Notice', 'TopUpLink', 'DocsLink'])}
                disabled={saving}
              >
                <Save className="size-4 mr-2" />
                {saving ? t('保存中...') : t('保存')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 认证设置 */}
        <TabsContent value="auth" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('认证配置')}</CardTitle>
              <CardDescription>{t('登录、注册和第三方认证配置')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('密码登录')}</Label>
                    <p className="text-sm text-muted-foreground">{t('允许用户通过用户名/密码登录')}</p>
                  </div>
                  <Switch
                    checked={toBoolean(options['PasswordLoginEnabled'])}
                    onCheckedChange={(v) => setBoolOption('PasswordLoginEnabled', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('开放注册')}</Label>
                    <p className="text-sm text-muted-foreground">{t('允许新用户注册')}</p>
                  </div>
                  <Switch
                    checked={toBoolean(options['RegisterEnabled'])}
                    onCheckedChange={(v) => setBoolOption('RegisterEnabled', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('邮件验证')}</Label>
                    <p className="text-sm text-muted-foreground">{t('注册时需要邮件验证')}</p>
                  </div>
                  <Switch
                    checked={toBoolean(options['EmailVerificationEnabled'])}
                    onCheckedChange={(v) => setBoolOption('EmailVerificationEnabled', v)}
                  />
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="font-medium">{t('GitHub OAuth')}</h3>
                <div className="flex items-center justify-between">
                  <Label>{t('启用')}</Label>
                  <Switch
                    checked={toBoolean(options['GitHubOAuthEnabled'])}
                    onCheckedChange={(v) => setBoolOption('GitHubOAuthEnabled', v)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input
                    value={options['GitHubClientId'] ?? ''}
                    onChange={(e) => setOption('GitHubClientId', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    value={options['GitHubClientSecret'] ?? ''}
                    onChange={(e) => setOption('GitHubClientSecret', e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={() => handleSaveOptions([
                  'PasswordLoginEnabled', 'RegisterEnabled', 'EmailVerificationEnabled',
                  'GitHubOAuthEnabled', 'GitHubClientId', 'GitHubClientSecret',
                ])}
                disabled={saving}
              >
                <Save className="size-4 mr-2" />
                {saving ? t('保存中...') : t('保存')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 运营设置 */}
        <TabsContent value="operation" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('运营配置')}</CardTitle>
              <CardDescription>{t('用户额度、邀请奖励等运营设置')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('新用户初始额度')}</Label>
                <Input
                  type="number"
                  value={options['NewUserQuota'] ?? ''}
                  onChange={(e) => setOption('NewUserQuota', e.target.value)}
                  placeholder="100"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('邀请奖励额度')}</Label>
                <Input
                  type="number"
                  value={options['InvitationQuota'] ?? ''}
                  onChange={(e) => setOption('InvitationQuota', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('被邀请者奖励额度')}</Label>
                <Input
                  type="number"
                  value={options['RegisterQuota'] ?? ''}
                  onChange={(e) => setOption('RegisterQuota', e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('启用绘图功能')}</Label>
                </div>
                <Switch
                  checked={toBoolean(options['DrawingEnabled'])}
                  onCheckedChange={(v) => setBoolOption('DrawingEnabled', v)}
                />
              </div>
              <Button
                onClick={() => handleSaveOptions([
                  'NewUserQuota', 'InvitationQuota', 'RegisterQuota', 'DrawingEnabled',
                ])}
                disabled={saving}
              >
                <Save className="size-4 mr-2" />
                {saving ? t('保存中...') : t('保存')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 额度设置 */}
        <TabsContent value="quota" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('额度配置')}</CardTitle>
              <CardDescription>{t('额度单位、显示格式等配置')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('每单位额度对应金额')}</Label>
                <Input
                  type="number"
                  value={options['QuotaPerUnit'] ?? ''}
                  onChange={(e) => setOption('QuotaPerUnit', e.target.value)}
                  placeholder="500000"
                />
                <p className="text-xs text-muted-foreground">{t('1 单位货币 = X 额度')}</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('以货币形式显示额度')}</Label>
                  <p className="text-sm text-muted-foreground">{t('将额度换算成货币金额显示')}</p>
                </div>
                <Switch
                  checked={toBoolean(options['DisplayInCurrencyEnabled'])}
                  onCheckedChange={(v) => setBoolOption('DisplayInCurrencyEnabled', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('显示价格')}</Label>
                </div>
                <Switch
                  checked={toBoolean(options['ModelRatioEnabled'])}
                  onCheckedChange={(v) => setBoolOption('ModelRatioEnabled', v)}
                />
              </div>
              <Button
                onClick={() => handleSaveOptions([
                  'QuotaPerUnit', 'DisplayInCurrencyEnabled', 'ModelRatioEnabled',
                ])}
                disabled={saving}
              >
                <Save className="size-4 mr-2" />
                {saving ? t('保存中...') : t('保存')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 支付设置 */}
        <TabsContent value="payment" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('支付配置')}</CardTitle>
              <CardDescription>{t('在线支付和订阅功能配置')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('启用在线支付')}</Label>
                </div>
                <Switch
                  checked={toBoolean(options['PaymentEnabled'])}
                  onCheckedChange={(v) => setBoolOption('PaymentEnabled', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('启用订阅功能')}</Label>
                </div>
                <Switch
                  checked={toBoolean(options['SubscriptionEnabled'])}
                  onCheckedChange={(v) => setBoolOption('SubscriptionEnabled', v)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('货币符号')}</Label>
                <Input
                  value={options['Currency'] ?? ''}
                  onChange={(e) => setOption('Currency', e.target.value)}
                  placeholder="CNY"
                  className="max-w-xs"
                />
              </div>
              <Button
                onClick={() => handleSaveOptions(['PaymentEnabled', 'SubscriptionEnabled', 'Currency'])}
                disabled={saving}
              >
                <Save className="size-4 mr-2" />
                {saving ? t('保存中...') : t('保存')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SettingPage() {
  return (
    <AuthGuard requireAdmin>
      <SettingContent />
    </AuthGuard>
  );
}
