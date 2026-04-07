'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  User, Lock, Shield, RefreshCw, Save,
  Mail, Calendar, Users, Pencil, CheckCircle2,
  Bell, Webhook, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AuthGuard } from '@/components/common/auth-guard';
import { CheckinCard } from '@/components/common/checkin-card';
import { useUser, persistUser } from '@/context/user-context';
import { API } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { User as UserType } from '@/types';

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

interface UserSetting {
  notify_type?: string;
  quota_warning_threshold?: number;
  quota_notify_enabled?: boolean;
  subscription_quota_notify_enabled?: boolean;
  webhook_url?: string;
  webhook_secret?: string;
  notification_email?: string;
  bark_url?: string;
  gotify_url?: string;
  gotify_token?: string;
  gotify_priority?: number;
}

const NOTIFY_TYPES = [
  { value: 'email', labelKey: '邮件通知' },
  { value: 'webhook', labelKey: 'Webhook' },
  { value: 'bark', labelKey: 'Bark 推送' },
  { value: 'gotify', labelKey: 'Gotify 推送' },
];

function getUserInitials(user?: Partial<UserType> | null): string {
  const name = user?.display_name || user?.username || 'U';
  return name.slice(0, 2).toUpperCase();
}

function InfoChip({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 border border-border/40 px-3.5 py-2.5">
      <div className="size-7 rounded-lg bg-background flex items-center justify-center shrink-0">
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function PersonalContent() {
  const { t } = useTranslation();
  const { state: userState, dispatch } = useUser();
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<Partial<UserType>>({});
  const [passwords, setPasswords] = useState({ old: '', new: '', confirm: '' });
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Notification settings state
  const [notifySetting, setNotifySetting] = useState<UserSetting>({});
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifySaved, setNotifySaved] = useState(false);
  const [testingNotify, setTestingNotify] = useState(false);

  useEffect(() => {
    if (userState.user) {
      setUserData({ display_name: userState.user.display_name, email: userState.user.email });
    }
  }, [userState.user]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await API.get('/api/user/self');
      const data = res.data as { success: boolean; data: UserType & { setting?: string } };
      if (data.success) {
        persistUser(data.data);
        dispatch({ type: 'login', payload: data.data });
        // Parse notification settings from user.setting JSON
        if (data.data.setting) {
          try {
            const parsed = JSON.parse(data.data.setting) as UserSetting;
            setNotifySetting(parsed);
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }, [dispatch]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      const res = await API.put('/api/user/self', { display_name: userData.display_name });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(t('更新成功'));
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2000);
        await refreshUser();
      } else { toast.error(data.message || t('更新失败')); }
    } catch { toast.error(t('更新失败')); }
    finally { setLoading(false); }
  };

  const handleChangePassword = async () => {
    if (!passwords.old) { toast.error(t('请输入当前密码')); return; }
    if (!passwords.new) { toast.error(t('请输入新密码')); return; }
    if (passwords.new !== passwords.confirm) { toast.error(t('两次密码不一致')); return; }
    setLoading(true);
    try {
      const res = await API.put('/api/user/self', { password: passwords.new, old_password: passwords.old });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(t('密码修改成功'));
        setPasswords({ old: '', new: '', confirm: '' });
        setPasswordSaved(true);
        setTimeout(() => setPasswordSaved(false), 2000);
      } else { toast.error(data.message || t('密码修改失败')); }
    } catch { toast.error(t('密码修改失败')); }
    finally { setLoading(false); }
  };

  const handleSaveNotifySettings = async () => {
    setNotifyLoading(true);
    try {
      const payload: Record<string, unknown> = {
        notify_type: notifySetting.notify_type || '',
        quota_warning_threshold: notifySetting.quota_warning_threshold ?? 0,
        quota_notify_enabled: notifySetting.quota_notify_enabled ?? true,
        subscription_quota_notify_enabled: notifySetting.subscription_quota_notify_enabled ?? true,
        webhook_url: notifySetting.webhook_url || '',
        webhook_secret: notifySetting.webhook_secret || '',
        notification_email: notifySetting.notification_email || '',
        bark_url: notifySetting.bark_url || '',
        gotify_url: notifySetting.gotify_url || '',
        gotify_token: notifySetting.gotify_token || '',
        gotify_priority: notifySetting.gotify_priority ?? 5,
      };
      const res = await API.put('/api/user/self/setting', payload);
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(t('通知设置已保存'));
        setNotifySaved(true);
        setTimeout(() => setNotifySaved(false), 2000);
      } else { toast.error(data.message || t('保存失败')); }
    } catch { toast.error(t('保存失败')); }
    finally { setNotifyLoading(false); }
  };

  const handleTestNotify = async () => {
    setTestingNotify(true);
    try {
      const res = await API.post('/api/user/notify/test', {
        notify_type: notifySetting.notify_type,
      });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(t('测试通知已发送'));
      } else {
        toast.error(data.message || t('发送失败'));
      }
    } catch { toast.error(t('发送失败')); }
    finally { setTestingNotify(false); }
  };

  const user = userState.user;
  const registeredDate = user?.created_time
    ? new Date(user.created_time * 1000).toLocaleDateString()
    : '-';

  const selectedNotifyLabel = NOTIFY_TYPES.find(n => n.value === notifySetting.notify_type)?.labelKey
    || t('选择通知方式');

  return (
    <div className="space-y-6 pb-8">

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t('个人设置')}</h1>
            <p className="text-sm text-muted-foreground">{t('管理账户信息和安全')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={refreshUser}>
          <RefreshCw className="size-3.5" />
          {t('刷新')}
        </Button>
      </motion.div>

      {/* Profile hero card */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <Card className="shadow-card overflow-hidden">
          {/* Gradient banner */}
          <div className="relative h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle at 80% 50%, hsl(var(--primary) / 0.12) 0%, transparent 60%)',
              }}
              aria-hidden="true"
            />
          </div>

          <div className="px-6 pb-6">
            {/* Avatar overlapping banner */}
            <div className="-mt-10 mb-4 flex items-end justify-between">
              <Avatar className="size-20 rounded-2xl ring-4 ring-background shadow-lg">
                <AvatarFallback className="rounded-2xl text-2xl font-bold bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                  {getUserInitials(user)}
                </AvatarFallback>
              </Avatar>
              <Badge
                variant="secondary"
                className="mb-1 text-xs bg-primary/10 text-primary border-primary/20 font-semibold"
              >
                {user?.group || 'default'}
              </Badge>
            </div>

            {/* Name & username */}
            <div className="mb-4">
              <h2 className="text-xl font-bold tracking-tight">
                {user?.display_name || user?.username || '-'}
              </h2>
              {user?.display_name && user?.username && (
                <p className="text-sm text-muted-foreground mt-0.5">@{user.username}</p>
              )}
            </div>

            {/* Info chips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <InfoChip icon={Mail} label={t('邮箱')} value={user?.email || t('未绑定')} />
              <InfoChip icon={Calendar} label={t('注册时间')} value={registeredDate} />
              <InfoChip icon={Users} label={t('用户分组')} value={user?.group || 'default'} />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Check-in card */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.08 }}>
        <CheckinCard />
      </motion.div>

      {/* Edit tabs */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.1 }}>
        <Tabs defaultValue="profile">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="profile" className="gap-1.5">
              <Pencil className="size-3.5" />{t('基本信息')}
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5">
              <Lock className="size-3.5" />{t('安全设置')}
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5">
              <Bell className="size-3.5" />{t('通知绑定')}
            </TabsTrigger>
          </TabsList>

          {/* Profile tab */}
          <TabsContent value="profile" className="mt-4">
            <Card className="shadow-card">
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="size-3.5 text-primary" />
                  </div>
                  {t('编辑个人信息')}
                </CardTitle>
                <CardDescription>{t('更新你的显示名称')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('显示名称')}</Label>
                  <Input
                    value={userData.display_name || ''}
                    onChange={(e) => setUserData({ ...userData, display_name: e.target.value })}
                    placeholder={t('请输入显示名称')}
                    className="h-10"
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateProfile()}
                  />
                  <p className="text-xs text-muted-foreground">{t('显示名称将展示在页面顶部和下拉菜单中')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleUpdateProfile}
                    disabled={loading}
                    className={cn('h-9 gap-2 transition-all', profileSaved && 'bg-success hover:bg-success')}
                  >
                    {loading ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : profileSaved ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    {loading ? t('保存中...') : profileSaved ? t('已保存') : t('保存修改')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security tab */}
          <TabsContent value="security" className="mt-4">
            <Card className="shadow-card">
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="size-7 rounded-lg bg-warning/10 flex items-center justify-center">
                    <Lock className="size-3.5 text-warning" />
                  </div>
                  {t('修改密码')}
                </CardTitle>
                <CardDescription>{t('定期修改密码有助于保护账号安全')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('当前密码')}</Label>
                  <Input
                    type="password"
                    value={passwords.old}
                    onChange={(e) => setPasswords({ ...passwords, old: e.target.value })}
                    placeholder={t('请输入当前密码')}
                    className="h-10"
                  />
                </div>
                <div className="h-px bg-border/40" />
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('新密码')}</Label>
                  <Input
                    type="password"
                    value={passwords.new}
                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    placeholder={t('请输入新密码')}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('确认新密码')}</Label>
                  <Input
                    type="password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    placeholder={t('请再次输入新密码')}
                    className={cn('h-10', passwords.confirm && passwords.new !== passwords.confirm && 'border-destructive focus-visible:ring-destructive/30')}
                    onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                  />
                  {passwords.confirm && passwords.new !== passwords.confirm && (
                    <p className="text-xs text-destructive">{t('两次密码不一致')}</p>
                  )}
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={loading}
                  className={cn('h-9 gap-2 transition-all', passwordSaved && 'bg-success hover:bg-success')}
                >
                  {loading ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : passwordSaved ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <Shield className="size-4" />
                  )}
                  {loading ? t('修改中...') : passwordSaved ? t('修改成功') : t('修改密码')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications tab */}
          <TabsContent value="notifications" className="mt-4 space-y-4">
            {/* Notify type + threshold */}
            <Card className="shadow-card">
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bell className="size-3.5 text-primary" />
                  </div>
                  {t('通知方式')}
                </CardTitle>
                <CardDescription>{t('选择接收系统通知的渠道')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Notify type selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('通知渠道')}</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-64 h-10 justify-between font-normal">
                        {t(selectedNotifyLabel)}
                        <ChevronDown className="size-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64">
                      {NOTIFY_TYPES.map(({ value, labelKey }) => (
                        <DropdownMenuItem
                          key={value}
                          onClick={() => setNotifySetting({ ...notifySetting, notify_type: value })}
                          className={cn(notifySetting.notify_type === value && 'text-primary font-medium bg-primary/5')}
                        >
                          {t(labelKey)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Quota warning threshold */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('额度预警阈值')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={notifySetting.quota_warning_threshold ?? ''}
                    onChange={(e) => setNotifySetting({ ...notifySetting, quota_warning_threshold: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="h-10 w-full sm:w-64"
                  />
                  <p className="text-xs text-muted-foreground">{t('当余额低于此阈值时发送通知，设为 0 表示不限制')}</p>
                </div>

                {/* Toggle switches */}
                <div className="space-y-3 rounded-xl border border-border/40 p-4 bg-muted/20">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t('余额不足提醒')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t('当账户余额低于预警阈值时通知')}</p>
                    </div>
                    <Switch
                      checked={notifySetting.quota_notify_enabled ?? true}
                      onCheckedChange={(v) => setNotifySetting({ ...notifySetting, quota_notify_enabled: v })}
                    />
                  </div>
                  <div className="h-px bg-border/40" />
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t('订阅额度提醒')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t('当订阅额度不足时通知')}</p>
                    </div>
                    <Switch
                      checked={notifySetting.subscription_quota_notify_enabled ?? true}
                      onCheckedChange={(v) => setNotifySetting({ ...notifySetting, subscription_quota_notify_enabled: v })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email */}
            {notifySetting.notify_type === 'email' && (
              <Card className="shadow-card">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="size-7 rounded-lg bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
                      <Mail className="size-3.5 text-sky-600 dark:text-sky-400" />
                    </div>
                    {t('邮件通知配置')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('通知邮箱')}</Label>
                    <Input
                      type="email"
                      value={notifySetting.notification_email || ''}
                      onChange={(e) => setNotifySetting({ ...notifySetting, notification_email: e.target.value })}
                      placeholder="you@example.com"
                      className="h-10"
                    />
                    <p className="text-xs text-muted-foreground">{t('留空则使用账户注册邮箱')}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bark */}
            {notifySetting.notify_type === 'bark' && (
              <Card className="shadow-card">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="size-7 rounded-lg bg-gold/10 flex items-center justify-center">
                      <Bell className="size-3.5 text-gold" />
                    </div>
                    {t('Bark 推送配置')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('Bark URL')}</Label>
                    <Input
                      value={notifySetting.bark_url || ''}
                      onChange={(e) => setNotifySetting({ ...notifySetting, bark_url: e.target.value })}
                      placeholder="https://api.day.app/your-key"
                      className="h-10"
                    />
                    <p className="text-xs text-muted-foreground">{t('请填写完整的 Bark 推送地址')}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Webhook */}
            {notifySetting.notify_type === 'webhook' && (
              <Card className="shadow-card">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="size-7 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
                      <Webhook className="size-3.5 text-violet-600 dark:text-violet-400" />
                    </div>
                    {t('Webhook 配置')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('Webhook URL')}</Label>
                    <Input
                      value={notifySetting.webhook_url || ''}
                      onChange={(e) => setNotifySetting({ ...notifySetting, webhook_url: e.target.value })}
                      placeholder="https://your-server.com/webhook"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('Webhook 密钥')}</Label>
                    <Input
                      value={notifySetting.webhook_secret || ''}
                      onChange={(e) => setNotifySetting({ ...notifySetting, webhook_secret: e.target.value })}
                      placeholder={t('可选，用于验证请求合法性')}
                      className="h-10"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Gotify */}
            {notifySetting.notify_type === 'gotify' && (
              <Card className="shadow-card">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="size-7 rounded-lg bg-success/10 flex items-center justify-center">
                      <Bell className="size-3.5 text-success" />
                    </div>
                    {t('Gotify 配置')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('Gotify 服务器地址')}</Label>
                    <Input
                      value={notifySetting.gotify_url || ''}
                      onChange={(e) => setNotifySetting({ ...notifySetting, gotify_url: e.target.value })}
                      placeholder="https://gotify.example.com"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('应用令牌')}</Label>
                    <Input
                      value={notifySetting.gotify_token || ''}
                      onChange={(e) => setNotifySetting({ ...notifySetting, gotify_token: e.target.value })}
                      placeholder={t('Gotify 应用 Token')}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('消息优先级')}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={notifySetting.gotify_priority ?? 5}
                      onChange={(e) => setNotifySetting({ ...notifySetting, gotify_priority: parseInt(e.target.value) || 5 })}
                      className="h-10 w-32"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Save + Test */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={handleSaveNotifySettings}
                disabled={notifyLoading}
                className={cn('h-9 gap-2 transition-all', notifySaved && 'bg-success hover:bg-success')}
              >
                {notifyLoading ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : notifySaved ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Save className="size-4" />
                )}
                {notifyLoading ? t('保存中...') : notifySaved ? t('已保存') : t('保存设置')}
              </Button>
              {notifySetting.notify_type && (
                <Button
                  variant="outline"
                  onClick={handleTestNotify}
                  disabled={testingNotify}
                  className="h-9 gap-2"
                >
                  {testingNotify ? <RefreshCw className="size-4 animate-spin" /> : <Bell className="size-4" />}
                  {t('发送测试通知')}
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

export default function PersonalPage() {
  return (
    <AuthGuard>
      <PersonalContent />
    </AuthGuard>
  );
}
