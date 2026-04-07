'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  Key,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  Search,
  Infinity,
  Shield,
  Activity,
  Pencil,
  Filter,
  AlertTriangle,
  LogIn,
  ExternalLink,
  Terminal,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AuthGuard } from '@/components/common/auth-guard';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';
import { copy, formatTimestamp, formatQuota, formatTokensCompact, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Token } from '@/types';

const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const itemVariants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

interface TokenPageInfo { items: Token[] }

// ─── Simple Checkbox ──────────────────────────────────────────────────────────

function Checkbox({ checked, indeterminate, onChange, className }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={cn(
        'size-4 rounded border-border accent-primary cursor-pointer',
        className,
      )}
    />
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, loading, danger }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={cn('size-8 rounded-lg flex items-center justify-center', danger ? 'bg-destructive/10' : 'bg-primary/10')}>
              <AlertTriangle className={cn('size-4', danger ? 'text-destructive' : 'text-primary')} />
            </div>
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-1">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('取消')}
          </Button>
          <Button
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
            className="min-w-[72px]"
          >
            {loading ? <RefreshCw className="size-4 animate-spin" /> : t('确认删除')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function TokenStatusBadge({ status }: { status: number }) {
  const { t } = useTranslation();
  if (status === 1)
    return (
      <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
        <CheckCircle className="size-3 mr-1" />{t('已启用')}
      </Badge>
    );
  if (status === 2)
    return (
      <Badge className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10">
        <XCircle className="size-3 mr-1" />{t('已禁用')}
      </Badge>
    );
  return (
    <Badge variant="secondary">
      <Clock className="size-3 mr-1" />{t('已过期')}
    </Badge>
  );
}

// ─── Key display ──────────────────────────────────────────────────────────────

function withSkPrefix(key: string) {
  return key.startsWith('sk-') ? key : `sk-${key}`;
}

function TokenKeyDisplay({ tokenId, maskedKey }: { tokenId: number; maskedKey: string }) {
  const { t } = useTranslation();
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);

  const displayKey = withSkPrefix(fullKey ?? maskedKey);
  const shownKey = revealed ? displayKey : displayKey.slice(0, 14) + '••••••••';

  const fetchFull = async () => {
    if (fullKey) return fullKey;
    setLoading(true);
    try {
      const res = await API.post(`/api/token/${tokenId}/key`);
      const data = res.data as { success: boolean; data?: { key: string }; message?: string };
      if (data.success && data.data?.key) { setFullKey(data.data.key); return data.data.key; }
      toast.error(data.message || t('获取完整 Key 失败'));
      return null;
    } catch { toast.error(t('获取完整 Key 失败')); return null; }
    finally { setLoading(false); }
  };

  const handleReveal = async () => { if (!fullKey) await fetchFull(); setRevealed(v => !v); };
  const handleCopy = async () => {
    const k = fullKey ? withSkPrefix(fullKey) : withSkPrefix(maskedKey);
    if (await copy(k)) toast.success(t('已复制到剪切板'));
  };
  const handleCopyFull = async () => {
    const k = await fetchFull();
    if (k && await copy(withSkPrefix(k))) toast.success(t('完整 Key 已复制'));
  };

  return (
    <div className="flex items-center gap-1.5">
      <code className="text-xs font-mono bg-muted/60 px-2 py-1 rounded-md max-w-[180px] truncate block border border-border/40">
        {shownKey}
      </code>
      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground shrink-0"
        title={revealed ? t('隐藏') : t('查看完整 Key')} onClick={handleReveal} disabled={loading}>
        {loading ? <RefreshCw className="size-3.5 animate-spin" /> : revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground shrink-0"
        title={t('复制')} onClick={fullKey ? handleCopy : handleCopyFull}>
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}

// ─── Create / Edit dialog ─────────────────────────────────────────────────────

interface TokenFormData { name: string; unlimited: boolean; quota: string; expiredTime: string; group: string }
const emptyForm = (): TokenFormData => ({ name: '', unlimited: true, quota: '', expiredTime: '', group: '' });
function tokenToForm(t: Token): TokenFormData {
  return {
    name: t.name,
    unlimited: t.unlimited_quota,
    quota: t.unlimited_quota ? '' : String(t.remain_quota),
    expiredTime: t.expired_time > 0 ? new Date(t.expired_time * 1000).toISOString().slice(0, 16) : '',
    group: t.group ?? '',
  };
}

function TokenDialog({ open, onOpenChange, editToken, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; editToken?: Token | null; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<TokenFormData>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<Array<{ value: string; label: string; ratio?: number | string }>>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const isEdit = !!editToken;

  useEffect(() => { if (open) setForm(editToken ? tokenToForm(editToken) : emptyForm()); }, [open, editToken]);

  useEffect(() => {
    if (!open) return;
    setGroupsLoading(true);
    API.get('/api/user/self/groups').then((res) => {
      const d = res.data as { success: boolean; data?: Record<string, { desc: string; ratio?: number | string }> };
      if (d.success && d.data) {
        setGroups(
          Object.entries(d.data).map(([value, info]) => ({
            value,
            label: info.desc || value,
            ratio: info.ratio,
          }))
        );
      }
    }).catch(() => {}).finally(() => setGroupsLoading(false));
  }, [open]);
  const set = <K extends keyof TokenFormData>(k: K, v: TokenFormData[K]) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error(t('请输入令牌名称')); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        unlimited_quota: form.unlimited,
        remain_quota: form.unlimited ? 0 : Number(form.quota),
        expired_time: form.expiredTime ? Math.floor(new Date(form.expiredTime).getTime() / 1000) : -1,
        ...(form.group ? { group: form.group } : {}),
      };
      if (isEdit) body.id = editToken!.id;
      const res = isEdit ? await API.put('/api/token/', body) : await API.post('/api/token/', body);
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(isEdit ? t('修改成功') : t('令牌创建成功'));
        onDone(); onOpenChange(false);
      } else { toast.error(data.message || (isEdit ? t('修改失败') : t('创建失败'))); }
    } catch { toast.error(isEdit ? t('修改失败') : t('创建失败')); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Key className="size-4 text-primary" />
            </div>
            {isEdit ? t('编辑令牌') : t('创建令牌')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-sm">{t('令牌名称')} <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
              placeholder={t('例如：我的应用')} onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSubmit()} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">{t('令牌分组')}</Label>
            <Select
              value={form.group || '__default__'}
              onValueChange={(v) => set('group', v === '__default__' ? '' : v)}
              disabled={groupsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('默认（继承账户分组）')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  <span className="text-muted-foreground">{t('默认（继承账户分组）')}</span>
                </SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{g.value}</span>
                      {g.label !== g.value && (
                        <span className="text-xs text-muted-foreground">{g.label}</span>
                      )}
                      {g.ratio !== undefined && (
                        <span className="text-xs text-muted-foreground ml-auto">
                          {typeof g.ratio === 'string' ? g.ratio : `×${g.ratio}`}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('不选则使用账户默认分组')}</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">{t('无限额度')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('不限制此令牌的使用量')}</p>
            </div>
            <Switch checked={form.unlimited} onCheckedChange={(v: boolean) => set('unlimited', v)} />
          </div>
          {!form.unlimited && (
            <div className="space-y-1.5">
              <Label className="text-sm">{t('额度限制')}</Label>
              <Input type="number" value={form.quota}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('quota', e.target.value)} placeholder="500000" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">{t('过期时间')}<span className="text-muted-foreground text-xs ml-1">({t('可选，留空永不过期')})</span></Label>
            <Input type="datetime-local" value={form.expiredTime}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('expiredTime', e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('取消')}</Button>
          <Button onClick={handleSubmit} disabled={loading} className="min-w-[80px]">
            {loading ? <RefreshCw className="size-4 animate-spin" /> : isEdit ? t('保存') : t('创建')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stat filter card ─────────────────────────────────────────────────────────

function StatFilterCard({ label, value, icon: Icon, iconBg, iconColor, active, onClick }: {
  label: string; value: string | number;
  icon: React.ElementType; iconBg: string; iconColor: string;
  active: boolean; onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.button
      variants={itemVariants}
      onClick={onClick}
      className={cn(
        'stat-card group cursor-pointer text-left w-full transition-all duration-150',
        active && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
        </div>
        <div className={cn('size-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110', iconBg)}>
          <Icon className={cn('size-5', iconColor)} />
        </div>
      </div>
      {active && (
        <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium">
          <Filter className="size-3" />
          {t('筛选中')}
        </div>
      )}
    </motion.button>
  );
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 10 }).map((__, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ─── CCSwitch import sheet ───────────────────────────────────────────────────

function buildClaudeDeepLink(apiKey: string, baseUrl: string, name: string): string {
  const config = {
    env: {
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6',
    },
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
  const params = new URLSearchParams({
    resource: 'provider',
    app: 'claude',
    name,
    configFormat: 'json',
    config: encoded,
  });
  return `ccswitch://v1/import?${params.toString()}`;
}

function buildCodexDeepLink(apiKey: string, baseUrl: string, name: string): string {
  const tomlConfig = `[model_providers.openai]\nbase_url = "${baseUrl}"`;
  const config = {
    auth: { OPENAI_API_KEY: apiKey },
    config: tomlConfig,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
  const params = new URLSearchParams({
    resource: 'provider',
    app: 'codex',
    name,
    configFormat: 'json',
    config: encoded,
  });
  return `ccswitch://v1/import?${params.toString()}`;
}

function ImportConfigSheet({ token, open, onOpenChange }: {
  token: Token | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const [loadingApp, setLoadingApp] = useState<'claude' | 'codex' | null>(null);

  const baseUrl = (() => {
    const addr = status?.server_address;
    if (!addr) return typeof window !== 'undefined' ? window.location.origin : '';
    return addr.replace(/\/$/, '');
  })();

  const providerName = `${status?.system_name || 'fishxcode'} (${token?.name || ''})`;

  const fetchKeyAndImport = async (app: 'claude' | 'codex') => {
    if (!token) return;
    setLoadingApp(app);
    try {
      const res = await API.post(`/api/token/${token.id}/key`);
      const data = res.data as { success: boolean; data?: { key: string }; message?: string };
      if (!data.success || !data.data?.key) {
        toast.error(data.message || t('获取完整 Key 失败'));
        return;
      }
      const fullKey = data.data.key.startsWith('sk-') ? data.data.key : `sk-${data.data.key}`;
      const deepLink = app === 'claude'
        ? buildClaudeDeepLink(fullKey, baseUrl, providerName)
        : buildCodexDeepLink(fullKey, `${baseUrl}/v1`, providerName);

      window.location.href = deepLink;
      toast.success(t('正在打开 CC Switch...'));
      setTimeout(() => onOpenChange(false), 800);
    } catch {
      toast.error(t('获取完整 Key 失败'));
    } finally {
      setLoadingApp(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[95vw] sm:w-[360px] sm:max-w-none md:w-[420px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <LogIn className="size-4 text-primary" />
            {t('一键导入配置')}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {t('将此令牌导入到 CC Switch 客户端，自动配置 API 端点和密钥')}
          </SheetDescription>
        </SheetHeader>

        {/* Token info */}
        <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2.5 flex items-center gap-2">
          <Key className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{token?.name}</span>
          <span className="ml-auto text-xs text-muted-foreground shrink-0">{baseUrl}</span>
        </div>

        <div className="mt-5 space-y-3">
          {/* Claude Code card */}
          <div className="rounded-xl border border-border/60 p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-lg bg-[#CC785C]/10 flex items-center justify-center shrink-0">
                <Bot className="size-5 text-[#CC785C]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Claude Code</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {t('配置 ANTHROPIC_AUTH_TOKEN 和 ANTHROPIC_BASE_URL，支持所有 Claude 模型')}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'].map(m => (
                    <span key={m} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{m}</span>
                  ))}
                </div>
              </div>
            </div>
            <Button
              className="w-full mt-3 gap-2"
              size="sm"
              onClick={() => fetchKeyAndImport('claude')}
              disabled={loadingApp !== null}
            >
              {loadingApp === 'claude'
                ? <RefreshCw className="size-3.5 animate-spin" />
                : <ExternalLink className="size-3.5" />}
              {t('导入到 Claude Code')}
            </Button>
          </div>

          {/* Codex card */}
          <div className="rounded-xl border border-border/60 p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Terminal className="size-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">OpenAI Codex</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {t('配置 OPENAI_API_KEY 和 base_url（TOML 格式）')}
                </p>
              </div>
            </div>
            <Button
              className="w-full mt-3 gap-2"
              variant="outline"
              size="sm"
              onClick={() => fetchKeyAndImport('codex')}
              disabled={loadingApp !== null}
            >
              {loadingApp === 'codex'
                ? <RefreshCw className="size-3.5 animate-spin" />
                : <ExternalLink className="size-3.5" />}
              {t('导入到 Codex')}
            </Button>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground text-center">
          {t('需要安装 CC Switch 客户端（v3.8+）')}
        </p>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function TokensContent() {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editToken, setEditToken] = useState<Token | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<'single' | 'batch'>('single');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importToken, setImportToken] = useState<Token | null>(null);

  // Filter & selection state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const loadTokens = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await API.get('/api/token?p=1&page_size=200');
      const data = res.data as { success: boolean; data: TokenPageInfo };
      if (data.success) setTokens(data.data?.items || []);
      else toast.error(t('加载令牌失败'));
    } catch { toast.error(t('加载令牌失败')); }
    finally { setLoading(false); setRefreshing(false); }
  }, [t]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const activeCount = tokens.filter(tk => tk.status === 1).length;
  const disabledCount = tokens.filter(tk => tk.status === 2).length;
  const unlimitedCount = tokens.filter(tk => tk.unlimited_quota).length;

  const filteredTokens = tokens.filter(tk => {
    const matchSearch = !search || tk.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === '1' && tk.status === 1) ||
      (statusFilter === '2' && tk.status === 2) ||
      (statusFilter === '3' && tk.status === 3) ||
      (statusFilter === 'unlimited' && tk.unlimited_quota);
    return matchSearch && matchStatus;
  });

  const allSelected = filteredTokens.length > 0 && filteredTokens.every(tk => selected.has(tk.id));
  const someSelected = filteredTokens.some(tk => selected.has(tk.id)) && !allSelected;
  const selectedInView = filteredTokens.filter(tk => selected.has(tk.id));

  const toggleSelect = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleAll = (v: boolean) =>
    setSelected(prev => {
      const s = new Set(prev);
      filteredTokens.forEach(tk => v ? s.add(tk.id) : s.delete(tk.id));
      return s;
    });

  // ── Card filter toggle ────────────────────────────────────────────────────────
  const toggleCardFilter = (val: string) =>
    setStatusFilter(prev => (prev === val ? 'all' : val));

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleToggleStatus = async (token: Token) => {
    const newStatus = token.status === 1 ? 2 : 1;
    try {
      const res = await API.put('/api/token/?status_only=true', { id: token.id, status: newStatus });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        setTokens(prev => prev.map(tk => tk.id === token.id ? { ...tk, status: newStatus } : tk));
        toast.success(newStatus === 1 ? t('已启用') : t('已禁用'));
      } else { toast.error(data.message || t('操作失败')); }
    } catch { toast.error(t('操作失败')); }
  };

  // Single delete — shows confirm
  const requestDeleteSingle = (id: number) => {
    setConfirmTarget('single');
    setConfirmId(id);
    setConfirmOpen(true);
  };

  // Batch delete — shows confirm
  const requestDeleteBatch = () => {
    setConfirmTarget('batch');
    setConfirmId(null);
    setConfirmOpen(true);
  };

  const doDelete = async (ids: number[]) => {
    let anyFail = false;
    await Promise.all(ids.map(async id => {
      try {
        const res = await API.delete(`/api/token/${id}`);
        const data = res.data as { success: boolean };
        if (!data.success) anyFail = true;
      } catch { anyFail = true; }
    }));
    setTokens(prev => prev.filter(tk => !ids.includes(tk.id)));
    setSelected(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
    toast[anyFail ? 'error' : 'success'](
      anyFail ? t('部分删除失败') : `${t('已删除')} ${ids.length} ${t('条令牌')}`,
    );
  };

  const handleConfirmDelete = async () => {
    setConfirmLoading(true);
    try {
      if (confirmTarget === 'single' && confirmId !== null) {
        await doDelete([confirmId]);
      } else {
        await doDelete(selectedInView.map(tk => tk.id));
      }
    } finally {
      setConfirmLoading(false);
      setConfirmOpen(false);
    }
  };

  const openEdit = (token: Token) => { setEditToken(token); setDialogOpen(true); };
  const openCreate = () => { setEditToken(null); setDialogOpen(true); };

  const confirmDescription =
    confirmTarget === 'batch'
      ? `${t('即将删除选中的')} ${selectedInView.length} ${t('个令牌，删除后不可恢复。')}`
      : t('删除后不可恢复，确认继续？');

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Key className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t('令牌管理')}</h1>
            <p className="text-sm text-muted-foreground">{t('创建和管理 API 访问密钥')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5"
            onClick={() => loadTokens(true)} disabled={loading || refreshing}>
            <RefreshCw className={cn('size-3.5', (loading || refreshing) && 'animate-spin')} />{t('刷新')}
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
            <Plus className="size-3.5" />{t('创建令牌')}
          </Button>
        </div>
      </motion.div>

      {/* Stat filter cards — click to filter */}
      <motion.div variants={containerVariants} initial="hidden" animate="show"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatFilterCard label={t('全部令牌')} value={tokens.length}
          icon={Key} iconBg="bg-primary/10" iconColor="text-primary"
          active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <StatFilterCard label={t('已启用')} value={activeCount}
          icon={CheckCircle} iconBg="bg-success/10" iconColor="text-success"
          active={statusFilter === '1'} onClick={() => toggleCardFilter('1')} />
        <StatFilterCard label={t('已禁用')} value={disabledCount}
          icon={Shield} iconBg="bg-destructive/8" iconColor="text-destructive"
          active={statusFilter === '2'} onClick={() => toggleCardFilter('2')} />
        <StatFilterCard label={t('无限额度')} value={unlimitedCount}
          icon={Infinity} iconBg="bg-primary/10" iconColor="text-primary"
          active={statusFilter === 'unlimited'} onClick={() => toggleCardFilter('unlimited')} />
      </motion.div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-center">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder={t('搜索令牌名称...')} value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="pl-9 w-full sm:w-52 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-32 h-9">
            <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('全部状态')}</SelectItem>
            <SelectItem value="1">{t('已启用')}</SelectItem>
            <SelectItem value="2">{t('已禁用')}</SelectItem>
            <SelectItem value="3">{t('已过期')}</SelectItem>
            <SelectItem value="unlimited">{t('无限额度')}</SelectItem>
          </SelectContent>
        </Select>
        {(search || statusFilter !== 'all') && (
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground"
            onClick={() => { setSearch(''); setStatusFilter('all'); }}>
            {t('清除筛选')}
          </Button>
        )}

        {/* Batch delete bar */}
        {selectedInView.length > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5">
            <span className="text-xs text-destructive font-medium">
              {t('已选')} {selectedInView.length} {t('条')}
            </span>
            <Button size="sm" variant="destructive" className="h-7 text-xs gap-1.5"
              onClick={requestDeleteBatch}>
              <Trash2 className="size-3.5" />{t('批量删除')}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => setSelected(new Set())}>
              {t('取消选择')}
            </Button>
          </div>
        )}
        {(search || statusFilter !== 'all') && selectedInView.length === 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {t('共')} {filteredTokens.length} {t('条')}
          </span>
        )}
      </div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>{t('名称')}</TableHead>
                  <TableHead>{t('密钥')}</TableHead>
                  <TableHead className="w-16">{t('导入')}</TableHead>
                  <TableHead>{t('状态')}</TableHead>
                  <TableHead className="text-right">{t('剩余额度')}</TableHead>
                  <TableHead className="text-right">{t('已用额度')}</TableHead>
                  <TableHead>{t('创建时间')}</TableHead>
                  <TableHead>{t('过期时间')}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : filteredTokens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-14 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2.5">
                        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
                          <Key className="size-6 opacity-30" />
                        </div>
                        <p className="text-sm">
                          {search || statusFilter !== 'all' ? t('未找到匹配的令牌') : t('还没有令牌，点击右上角创建')}
                        </p>
                        {!search && statusFilter === 'all' && (
                          <Button size="sm" variant="outline" className="mt-1" onClick={openCreate}>
                            <Plus className="size-4 mr-1.5" />{t('创建第一个令牌')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTokens.map((token) => {
                    const isChecked = selected.has(token.id);
                    return (
                      <TableRow key={token.id}
                        className={cn(
                          'hover:bg-accent/60 dark:hover:bg-accent/40 transition-colors',
                          token.status === 2 && 'opacity-60',
                          isChecked && 'bg-primary/5',
                        )}>
                        <TableCell className="pl-4">
                          <Checkbox checked={isChecked} onChange={() => toggleSelect(token.id)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={cn('size-2 rounded-full shrink-0',
                              token.status === 1 ? 'bg-success' : token.status === 2 ? 'bg-destructive/60' : 'bg-muted-foreground/40')} />
                            <span className="font-medium text-sm">{token.name}</span>
                          </div>
                        </TableCell>
                        <TableCell><TokenKeyDisplay tokenId={token.id} maskedKey={token.key} /></TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-primary/60 hover:text-primary hover:bg-primary/10"
                            title={t('导入配置')}
                            onClick={() => { setImportToken(token); setImportOpen(true); }}
                          >
                            <LogIn className="size-3.5" />
                          </Button>
                        </TableCell>
                        <TableCell><TokenStatusBadge status={token.status} /></TableCell>
                        <TableCell className="text-sm text-right">
                          {token.unlimited_quota ? (
                            <span className="flex items-center justify-end gap-1 text-primary">
                              <Infinity className="size-3.5" />{t('无限')}
                            </span>
                          ) : (
                            <div>
                              <div className={cn(token.remain_quota <= 0 && 'text-destructive')}>
                                {formatQuota(token.remain_quota, status)}
                              </div>
                              {status?.quota_display_type !== 'TOKENS' && token.remain_quota > 0 && (
                                <div className="text-xs text-muted-foreground font-mono">{formatTokensCompact(token.remain_quota)}</div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          <div>{formatQuota(token.used_quota, status)}</div>
                          {status?.quota_display_type !== 'TOKENS' && token.used_quota > 0 && (
                            <div className="text-xs font-mono">{formatTokensCompact(token.used_quota)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(token.created_time)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {token.expired_time <= 0
                            ? <span className="text-muted-foreground/50">{t('永不过期')}</span>
                            : formatTimestamp(token.expired_time)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEdit(token)}>
                                <Pencil className="size-4 mr-2 text-muted-foreground" />{t('编辑')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleStatus(token)}>
                                {token.status === 1 ? (
                                  <><XCircle className="size-4 mr-2 text-muted-foreground" />{t('禁用')}</>
                                ) : (
                                  <><Activity className="size-4 mr-2 text-success" />{t('启用')}</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => requestDeleteSingle(token.id)}>
                                <Trash2 className="size-4 mr-2" />{t('删除')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      {/* Create/Edit dialog */}
      <TokenDialog open={dialogOpen} onOpenChange={setDialogOpen} editToken={editToken} onDone={() => loadTokens()} />

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTarget === 'batch' ? `${t('批量删除')} ${selectedInView.length} ${t('个令牌')}` : t('删除令牌')}
        description={confirmDescription}
        onConfirm={handleConfirmDelete}
        loading={confirmLoading}
        danger
      />

      {/* CCSwitch import sheet */}
      <ImportConfigSheet
        token={importToken}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </div>
  );
}

export default function TokenPage() {
  return (
    <AuthGuard>
      <TokensContent />
    </AuthGuard>
  );
}
