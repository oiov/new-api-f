'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Plus, Trash2, RefreshCw, Layers, MoreHorizontal, CheckCircle,
  XCircle, Search, Activity, Pencil, Filter, AlertTriangle,
  Zap, Ban, ChevronDown, Download, SlidersHorizontal, X,
  ChevronsUpDown, Check, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { AuthGuard } from '@/components/common/auth-guard';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';
import { formatTimestamp, formatQuota, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Channel } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_TYPES: Record<number, string> = {
  1: 'OpenAI',
  3: 'Azure OpenAI',
  8: '自定义渠道',
  14: 'Anthropic',
  25: 'Google Gemini',
  26: 'Cohere',
  27: '文心一言',
  28: '智谱 ChatGLM',
  29: '讯飞星火',
  30: '360 智脑',
  31: 'MiniMax',
  33: 'AWS Bedrock',
  37: '阶跃星辰',
  40: 'Google Vertex AI',
  41: 'Mistral',
  43: 'DeepSeek',
  45: 'DALL-E',
  46: 'Suno',
  47: 'Kling',
  48: 'Luma',
};

const TYPE_URL_HINT: Record<number, string> = {
  1: 'https://api.openai.com',
  3: 'https://{resource}.openai.azure.com',
  14: 'https://api.anthropic.com',
  25: 'https://generativelanguage.googleapis.com',
  33: 'https://bedrock-runtime.{region}.amazonaws.com',
  40: 'https://{region}-aiplatform.googleapis.com',
  8: 'https://your-custom-endpoint.com',
};

const STATUS_MAP: Record<number, { labelKey: string; icon: React.ElementType; badge: string }> = {
  1: { labelKey: '已启用', icon: CheckCircle, badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10' },
  2: { labelKey: '已禁用', icon: XCircle, badge: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10' },
  3: { labelKey: '自动禁用', icon: Ban, badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/10' },
};

const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const itemVariants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

const PAGE_SIZE = 20;

// ─── Checkbox ─────────────────────────────────────────────────────────────────

function Checkbox({ checked, indeterminate, onChange, className }: {
  checked: boolean; indeterminate?: boolean;
  onChange: (v: boolean) => void; className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <input ref={ref} type="checkbox" checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={cn('size-4 rounded border-border accent-primary cursor-pointer', className)} />
  );
}

// ─── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, loading }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  title: string; description: string; onConfirm: () => void; loading?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="size-4 text-destructive" />
            </div>
            {title}
          </DialogTitle>
          <DialogDescription className="pt-1">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{t('取消')}</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading} className="min-w-[72px]">
            {loading ? <RefreshCw className="size-4 animate-spin" /> : t('确认删除')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stat filter card ──────────────────────────────────────────────────────────

function StatFilterCard({ label, value, icon: Icon, iconBg, iconColor, active, onClick }: {
  label: string; value: string | number; icon: React.ElementType;
  iconBg: string; iconColor: string; active: boolean; onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.button variants={itemVariants} onClick={onClick}
      className={cn('stat-card group cursor-pointer text-left w-full transition-all duration-150',
        active && 'ring-2 ring-primary ring-offset-1 ring-offset-background')}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={cn('size-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110', iconBg)}>
          <Icon className={cn('size-5', iconColor)} />
        </div>
      </div>
      {active && (
        <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium">
          <Filter className="size-3" />{t('筛选中')}
        </div>
      )}
    </motion.button>
  );
}

// ─── Skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 10 }).map((__, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ─── Model picker dialog (with Tabs) ──────────────────────────────────────────

interface OpenAIModel { id: string; owned_by?: string }

function ModelList({
  models, selected, loading, search, onToggle, onToggleAll,
}: {
  models: string[]; selected: Set<string>; loading: boolean; search: string;
  onToggle: (m: string) => void; onToggleAll: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? models.filter(m => m.toLowerCase().includes(q)) : models;
  }, [models, search]);

  const allSelected = filtered.length > 0 && filtered.every(m => selected.has(m));

  if (loading && models.length === 0) {
    return (
      <div className="p-3 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
      </div>
    );
  }
  if (filtered.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{t('无可用模型')}</div>;
  }

  return (
    <div className="p-1">
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-muted/50 cursor-pointer border-b border-border/30 mb-1"
        onClick={() => onToggleAll(!allSelected)}>
        <input type="checkbox" checked={allSelected} readOnly
          className="size-3.5 rounded accent-primary cursor-pointer"
          onClick={(e) => e.stopPropagation()} />
        <span className="font-medium">{allSelected ? t('取消全选') : t('全选')} ({filtered.length})</span>
      </div>
      {filtered.map(m => (
        <div key={m}
          className={cn('flex items-center gap-2.5 px-3 py-1.5 rounded-md cursor-pointer text-sm transition-colors',
            selected.has(m) ? 'bg-primary/5' : 'hover:bg-muted/50')}
          onClick={() => onToggle(m)}>
          <input type="checkbox" checked={selected.has(m)} readOnly
            className="size-3.5 rounded accent-primary cursor-pointer"
            onClick={(e) => e.stopPropagation()} />
          <span className="font-mono text-xs truncate flex-1">{m}</span>
          {selected.has(m) && <Check className="size-3.5 text-primary shrink-0" />}
        </div>
      ))}
    </div>
  );
}

function ModelPickerDialog({ open, onOpenChange, channelId, channelType, channelKey, channelBaseUrl, currentModels, onApply }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  channelId?: number; channelType: number; channelKey: string; channelBaseUrl: string;
  currentModels: string[]; onApply: (models: string[]) => void;
}) {
  const { t } = useTranslation();
  const [systemModels, setSystemModels] = useState<string[]>([]);
  const [upstreamModels, setUpstreamModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'system' | 'upstream'>('system');
  const [loadingSystem, setLoadingSystem] = useState(false);
  const [loadingUpstream, setLoadingUpstream] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(currentModels.filter(Boolean)));
      setSearch('');
      setUpstreamModels([]);
      setActiveTab('system');
    }
  }, [open, currentModels]);

  // Fetch system models on open
  const fetchSystem = useCallback(async () => {
    setLoadingSystem(true);
    try {
      const res = await API.get('/api/channel/models');
      const data = res.data as { success: boolean; data: OpenAIModel[] };
      if (data.success) {
        setSystemModels([...new Set(data.data.map((m: OpenAIModel) => m.id))].sort());
      }
    } catch { toast.error(t('获取模型列表失败')); }
    finally { setLoadingSystem(false); }
  }, [t]);

  useEffect(() => { if (open) fetchSystem(); }, [open, fetchSystem]);

  // Fetch upstream models
  const fetchUpstream = async () => {
    setLoadingUpstream(true);
    setActiveTab('upstream');
    try {
      let models: string[] = [];
      if (channelId) {
        const res = await API.get(`/api/channel/fetch_models/${channelId}`);
        const data = res.data as { success: boolean; data: string[]; message?: string };
        if (data.success) models = data.data;
        else { toast.error(data.message || t('获取失败')); return; }
      } else {
        if (!channelKey.trim()) { toast.error(t('请先填写 API Key')); setActiveTab('system'); return; }
        const res = await API.post('/api/channel/fetch_models', {
          type: channelType, key: channelKey.trim(), base_url: channelBaseUrl.trim(),
        });
        const data = res.data as { success: boolean; data: string[]; message?: string };
        if (data.success) models = data.data;
        else { toast.error(data.message || t('获取失败')); setActiveTab('system'); return; }
      }
      setUpstreamModels([...new Set(models)].sort());
      // Auto-select fetched upstream models
      setSelected(new Set(models));
      toast.success(t('已从上游获取 {{count}} 个模型', { count: models.length }));
    } catch { toast.error(t('获取失败')); setActiveTab('system'); }
    finally { setLoadingUpstream(false); }
  };

  const toggle = (m: string) => setSelected(prev => {
    const s = new Set(prev); s.has(m) ? s.delete(m) : s.add(m); return s;
  });
  const toggleAll = (models: string[], v: boolean) => setSelected(prev => {
    const s = new Set(prev);
    const filtered = search
      ? models.filter(m => m.toLowerCase().includes(search.toLowerCase()))
      : models;
    filtered.forEach(m => v ? s.add(m) : s.delete(m));
    return s;
  });

  const handleApply = () => {
    onApply([...selected].sort());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChevronsUpDown className="size-4 text-primary" />{t('选择模型')}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3">
            <span>{t('已选 {{count}} 个模型', { count: selected.size })}</span>
            {selected.size > 0 && (
              <button className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setSelected(new Set())}>
                {t('清空选择')}
              </button>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input placeholder={t('搜索模型名称...')} value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm" />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'system' | 'upstream')}
          className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <TabsList className="h-8">
              <TabsTrigger value="system" className="text-xs h-7 px-3">
                <RefreshCw className="size-3 mr-1" />
                {t('系统模型')}
                {systemModels.length > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">({systemModels.length})</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="upstream" className="text-xs h-7 px-3">
                <Globe className="size-3 mr-1" />
                {t('上游模型')}
                {upstreamModels.length > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">({upstreamModels.length})</span>
                )}
              </TabsTrigger>
            </TabsList>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0"
              onClick={fetchUpstream} disabled={loadingUpstream || loadingSystem}>
              {loadingUpstream
                ? <RefreshCw className="size-3.5 animate-spin" />
                : <Download className="size-3.5" />}
              {t('从上游获取')}
            </Button>
          </div>

          <TabsContent value="system" className="flex-1 overflow-y-auto border border-border/50 rounded-lg min-h-0 mt-2">
            <ModelList
              models={systemModels}
              selected={selected}
              loading={loadingSystem}
              search={search}
              onToggle={toggle}
              onToggleAll={(v) => toggleAll(systemModels, v)}
            />
          </TabsContent>

          <TabsContent value="upstream" className="flex-1 overflow-y-auto border border-border/50 rounded-lg min-h-0 mt-2">
            {upstreamModels.length === 0 && !loadingUpstream ? (
              <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
                <Globe className="size-8 opacity-20" />
                <p>{t('点击「从上游获取」拉取该渠道的可用模型')}</p>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={fetchUpstream} disabled={loadingUpstream}>
                  <Download className="size-3.5" />{t('从上游获取')}
                </Button>
              </div>
            ) : (
              <ModelList
                models={upstreamModels}
                selected={selected}
                loading={loadingUpstream}
                search={search}
                onToggle={toggle}
                onToggleAll={(v) => toggleAll(upstreamModels, v)}
              />
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('取消')}</Button>
          <Button onClick={handleApply} className="gap-1.5">
            <Check className="size-4" />
            {t('应用选择')} ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create / Edit dialog ──────────────────────────────────────────────────────

interface ChannelFormData {
  name: string; type: string; key: string;
  base_url: string; models: string; groups: string[];
  weight: string; priority: string; test_model: string;
}

function emptyForm(): ChannelFormData {
  return { name: '', type: '1', key: '', base_url: '', models: '', groups: ['default'], weight: '0', priority: '0', test_model: '' };
}

function channelToForm(c: Channel): ChannelFormData {
  return {
    name: c.name, type: String(c.type), key: c.key,
    base_url: c.base_url || '', models: c.models || '',
    groups: c.group ? c.group.split(',').map((s: string) => s.trim()).filter(Boolean) : ['default'],
    weight: String(c.weight ?? 0), priority: String(c.priority ?? 0), test_model: c.test_model || '',
  };
}

function ChannelDialog({ open, onOpenChange, editChannel, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editChannel?: Channel | null; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ChannelFormData>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<string[]>(['default']);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const isEdit = !!editChannel;

  useEffect(() => {
    if (open) setForm(editChannel ? channelToForm(editChannel) : emptyForm());
  }, [open, editChannel]);

  useEffect(() => {
    if (!open) return;
    setLoadingGroups(true);
    API.get('/api/group/').then((res: { data: { success: boolean; data: string[] } }) => {
      const data = res.data;
      if (data.success && Array.isArray(data.data)) {
        setAvailableGroups(data.data.length ? data.data : ['default']);
      }
    }).catch(() => {}).finally(() => setLoadingGroups(false));
  }, [open]);

  const set = <K extends keyof ChannelFormData>(k: K, v: ChannelFormData[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const currentModels = useMemo(() =>
    form.models.split(',').map((s: string) => s.trim()).filter(Boolean),
    [form.models]
  );

  const modelCountLabel = currentModels.length > 0
    ? t('已配置 {{count}} 个模型', { count: currentModels.length })
    : t('未配置模型');

  const urlPlaceholder = TYPE_URL_HINT[Number(form.type)] || 'https://';

  const handleGroupToggle = (g: string) => {
    setForm(p => {
      const gs = p.groups.includes(g) ? p.groups.filter((x: string) => x !== g) : [...p.groups, g];
      return { ...p, groups: gs.length ? gs : ['default'] };
    });
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error(t('请输入渠道名称')); return; }
    if (!form.key.trim()) { toast.error(t('请输入 API Key')); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(), type: Number(form.type),
        key: form.key.trim(), base_url: form.base_url.trim(),
        models: form.models.trim(), group: form.groups.join(','),
        weight: Number(form.weight) || 0, priority: Number(form.priority) || 0,
        test_model: form.test_model.trim(),
      };
      if (isEdit) body.id = editChannel!.id;
      const res = isEdit ? await API.put('/api/channel/', body) : await API.post('/api/channel/', body);
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(isEdit ? t('修改成功') : t('渠道创建成功'));
        onDone(); onOpenChange(false);
      } else { toast.error(data.message || (isEdit ? t('修改失败') : t('创建失败'))); }
    } catch { toast.error(isEdit ? t('修改失败') : t('创建失败')); }
    finally { setLoading(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Layers className="size-4 text-primary" />
              </div>
              {isEdit ? t('编辑渠道') : t('添加渠道')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            {/* ── 基本信息 */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('基本信息')}</p>
              <div className="grid grid-cols-[1fr_160px] gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('渠道名称')} <span className="text-destructive">*</span></Label>
                  <Input value={form.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
                    placeholder={t('例如：OpenAI 主渠道')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('渠道类型')} <span className="text-destructive">*</span></Label>
                  <Select value={form.type} onValueChange={(v: string) => set('type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {Object.entries(CHANNEL_TYPES).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* ── 密钥与接口 */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('密钥与接口')}</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('API Key')} <span className="text-destructive">*</span></Label>
                  <Textarea value={form.key}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('key', e.target.value)}
                    placeholder={t('每行一个 Key，支持批量导入')}
                    rows={3} className="font-mono text-sm resize-none" />
                  <p className="text-xs text-muted-foreground">
                    {form.key.split('\n').filter((s: string) => s.trim()).length > 1
                      ? t('已输入 {{count}} 个 Key', { count: form.key.split('\n').filter((s: string) => s.trim()).length })
                      : t('多个 Key 请每行输入一个')}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    {t('代理地址')}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">({t('可选，留空使用默认')})</span>
                  </Label>
                  <Input value={form.base_url}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('base_url', e.target.value)}
                    placeholder={urlPlaceholder} className="font-mono text-sm" />
                </div>
              </div>
            </div>

            <Separator />

            {/* ── 模型配置 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('模型配置')}</p>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  onClick={() => setModelPickerOpen(true)}>
                  <ChevronsUpDown className="size-3.5" />{t('选择模型')}
                </Button>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{t('模型列表')}</Label>
                    <span className={cn('text-xs', currentModels.length > 0 ? 'text-primary' : 'text-muted-foreground')}>
                      {modelCountLabel}
                    </span>
                  </div>
                  <Textarea value={form.models}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('models', e.target.value)}
                    placeholder="gpt-4o,gpt-4o-mini,claude-3-5-sonnet-20241022"
                    rows={2} className="font-mono text-xs resize-none" />
                  <p className="text-xs text-muted-foreground">{t('逗号分隔，或点击「选择模型」从预设列表选择')}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    {t('测试模型')}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">({t('连接测试使用')})</span>
                  </Label>
                  {currentModels.length > 0 ? (
                    <Select value={form.test_model || '__custom__'}
                      onValueChange={(v: string) => set('test_model', v === '__custom__' ? '' : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('选择一个模型用于测试')} />
                      </SelectTrigger>
                      <SelectContent className="max-h-52">
                        <SelectItem value="__custom__">{t('不指定（自动选择）')}</SelectItem>
                        <Separator className="my-1" />
                        {currentModels.map(m => (
                          <SelectItem key={m} value={m}><span className="font-mono text-xs">{m}</span></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form.test_model}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('test_model', e.target.value)}
                      placeholder="gpt-4o-mini" className="font-mono text-sm" />
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* ── 路由配置 */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('路由配置')}</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('用户分组')}</Label>
                  {loadingGroups ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-md border border-input bg-background min-h-[38px]">
                      {availableGroups.map(g => (
                        <button key={g} type="button" onClick={() => handleGroupToggle(g)}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                            form.groups.includes(g)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground',
                          )}>
                          {g}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('已选分组：{{groups}}', { groups: form.groups.join(', ') || 'default' })}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">
                      {t('权重')}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">({t('负载均衡用')})</span>
                    </Label>
                    <Input type="number" min="0" value={form.weight}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('weight', e.target.value)}
                      placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">
                      {t('优先级')}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">({t('越大越优先')})</span>
                    </Label>
                    <Input type="number" value={form.priority}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('priority', e.target.value)}
                      placeholder="0" />
                  </div>
                </div>
              </div>
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

      <ModelPickerDialog
        open={modelPickerOpen}
        onOpenChange={setModelPickerOpen}
        channelId={isEdit ? editChannel?.id : undefined}
        channelType={Number(form.type)}
        channelKey={form.key}
        channelBaseUrl={form.base_url}
        currentModels={currentModels}
        onApply={(models) => set('models', models.join(','))}
      />
    </>
  );
}

// ─── Channel status badge ──────────────────────────────────────────────────────

function ChannelStatusBadge({ status }: { status: number }) {
  const { t } = useTranslation();
  const info = STATUS_MAP[status];
  if (!info) return <Badge variant="outline">{status}</Badge>;
  const Icon = info.icon;
  return <Badge className={info.badge}><Icon className="size-3 mr-1" />{t(info.labelKey)}</Badge>;
}

// ─── Test menu item ────────────────────────────────────────────────────────────

function TestMenuItem({ channelId, onResult }: { channelId: number; onResult: (ms: number) => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const handleTest = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/api/channel/test/${channelId}`);
      const data = res.data as { success: boolean; message?: string; time?: number };
      if (data.success) {
        const ms = data.time ? Math.round(data.time * 1000) : 0;
        toast.success(`${t('测试成功')} (${(ms / 1000).toFixed(2)}s)`);
        onResult(ms);
      } else { toast.error(data.message || t('测试失败')); }
    } catch { toast.error(t('测试失败')); }
    finally { setLoading(false); }
  };
  return (
    <DropdownMenuItem onClick={handleTest} disabled={loading}>
      {loading ? <RefreshCw className="size-4 mr-2 animate-spin text-muted-foreground" /> : <Activity className="size-4 mr-2 text-muted-foreground" />}
      {t('测试连接')}
    </DropdownMenuItem>
  );
}

// ─── Main page content ─────────────────────────────────────────────────────────

interface ChannelApiData {
  items: Channel[];
  total: number;
  page?: number;
  page_size?: number;
  type_counts?: Record<string, number>;
}

function ChannelContent() {
  const { t } = useTranslation();
  const status = useSystemStatus();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editChannel, setEditChannel] = useState<Channel | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<'single' | 'batch'>('single');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // Filters (all API-side except group)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Fetch groups for filter
  useEffect(() => {
    API.get('/api/group/').then((res: { data: { success: boolean; data: string[] } }) => {
      const data = res.data;
      if (data.success && Array.isArray(data.data)) setAvailableGroups(data.data);
    }).catch(() => {});
  }, []);

  // ── Fetch channels ────────────────────────────────────────────────────────
  const fetchChannels = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ p: String(pg), page_size: String(PAGE_SIZE) });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);

      let url: string;
      if (search.trim()) {
        params.set('keyword', search.trim());
        url = `/api/channel/search?${params}`;
      } else {
        url = `/api/channel/?${params}`;
      }

      const res = await API.get(url);
      const data = res.data as { success: boolean; data: ChannelApiData };
      if (data.success) {
        setChannels(data.data.items ?? []);
        setTotalItems(data.data.total ?? 0);
      }
    } catch { toast.error(t('加载失败')); }
    finally { setLoading(false); }
  }, [search, statusFilter, typeFilter, t]);

  // Re-fetch when filters or page changes
  useEffect(() => {
    fetchChannels(currentPage);
  }, [fetchChannels, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, typeFilter]);

  // ── Active filter count ────────────────────────────────────────────────────
  const activeFilterCount = [
    typeFilter !== 'all', groupFilter !== 'all',
    search.trim() !== '', statusFilter !== 'all',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch(''); setStatusFilter('all'); setTypeFilter('all'); setGroupFilter('all');
  };

  // ── Client-side group filter (applied on loaded data) ─────────────────────
  const filteredChannels = useMemo(() => {
    if (groupFilter === 'all') return channels;
    return channels.filter(c => {
      const cGroups = (c.group || 'default').split(',').map((s: string) => s.trim());
      return cGroups.includes(groupFilter);
    });
  }, [channels, groupFilter]);

  // Stats (from loaded page)
  const enabledCount = channels.filter(c => c.status === 1).length;
  const disabledCount = channels.filter(c => c.status === 2).length;
  const autoDisabledCount = channels.filter(c => c.status === 3).length;

  const allSelected = filteredChannels.length > 0 && filteredChannels.every(c => selected.has(c.id));
  const someSelected = filteredChannels.some(c => selected.has(c.id)) && !allSelected;
  const selectedInView = filteredChannels.filter(c => selected.has(c.id));

  const toggleSelect = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleAll = (v: boolean) =>
    setSelected(prev => { const s = new Set(prev); filteredChannels.forEach(c => v ? s.add(c.id) : s.delete(c.id)); return s; });
  const toggleCardFilter = (val: string) => {
    setStatusFilter(prev => prev === val ? 'all' : val);
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleToggleStatus = async (channel: Channel) => {
    const newStatus = channel.status === 1 ? 2 : 1;
    try {
      const res = await API.put('/api/channel/', { id: channel.id, status: newStatus });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        setChannels(prev => prev.map(c => c.id === channel.id ? { ...c, status: newStatus } : c));
        toast.success(newStatus === 1 ? t('已启用') : t('已禁用'));
      } else toast.error(data.message || t('操作失败'));
    } catch { toast.error(t('操作失败')); }
  };

  const handleTestResult = (channelId: number, ms: number) => {
    setChannels(prev => prev.map(c => c.id === channelId
      ? { ...c, response_time: ms, tested_time: Math.floor(Date.now() / 1000) } : c));
  };

  const requestDeleteSingle = (id: number) => { setConfirmTarget('single'); setConfirmId(id); setConfirmOpen(true); };
  const requestDeleteBatch = () => { setConfirmTarget('batch'); setConfirmId(null); setConfirmOpen(true); };

  const doDelete = async (ids: number[]) => {
    let anyFail = false;
    await Promise.all(ids.map(async id => {
      try { if (!(await API.delete(`/api/channel/${id}`)).data.success) anyFail = true; }
      catch { anyFail = true; }
    }));
    setSelected(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
    toast[anyFail ? 'error' : 'success'](
      anyFail ? t('部分删除失败') : `${t('已删除')} ${ids.length} ${t('个渠道')}`);
    fetchChannels(currentPage);
  };

  const handleConfirmDelete = async () => {
    setConfirmLoading(true);
    try {
      if (confirmTarget === 'single' && confirmId !== null) await doDelete([confirmId]);
      else await doDelete(selectedInView.map(c => c.id));
    } finally { setConfirmLoading(false); setConfirmOpen(false); }
  };

  const openEdit = (ch: Channel) => { setEditChannel(ch); setDialogOpen(true); };
  const openCreate = () => { setEditChannel(null); setDialogOpen(true); };

  const confirmDescription = confirmTarget === 'batch'
    ? `${t('即将删除选中的')} ${selectedInView.length} ${t('个渠道，删除后不可恢复。')}`
    : t('删除后不可恢复，确认继续？');

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t('渠道管理')}</h1>
            <p className="text-sm text-muted-foreground">{t('管理 API 上游渠道')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9"
            onClick={() => fetchChannels(currentPage)} disabled={loading}>
            <RefreshCw className={cn('size-4 mr-2', loading && 'animate-spin')} />{t('刷新')}
          </Button>
          <Button size="sm" className="h-9" onClick={openCreate}>
            <Plus className="size-4 mr-2" />{t('添加渠道')}
          </Button>
        </div>
      </motion.div>

      {/* Stat filter cards */}
      <motion.div variants={containerVariants} initial="hidden" animate="show"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatFilterCard label={t('全部渠道')} value={totalItems}
          icon={Layers} iconBg="bg-primary/10" iconColor="text-primary"
          active={statusFilter === 'all' && typeFilter === 'all' && groupFilter === 'all'}
          onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setGroupFilter('all'); }} />
        <StatFilterCard label={t('已启用')} value={enabledCount}
          icon={CheckCircle} iconBg="bg-emerald-50 dark:bg-emerald-900/20" iconColor="text-emerald-600 dark:text-emerald-400"
          active={statusFilter === '1'} onClick={() => toggleCardFilter('1')} />
        <StatFilterCard label={t('已禁用')} value={disabledCount}
          icon={XCircle} iconBg="bg-red-50 dark:bg-red-900/20" iconColor="text-red-600 dark:text-red-400"
          active={statusFilter === '2'} onClick={() => toggleCardFilter('2')} />
        <StatFilterCard label={t('自动禁用')} value={autoDisabledCount}
          icon={Ban} iconBg="bg-amber-50 dark:bg-amber-900/20" iconColor="text-amber-600 dark:text-amber-400"
          active={statusFilter === '3'} onClick={() => toggleCardFilter('3')} />
      </motion.div>

      {/* Filter toolbar */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder={t('搜索渠道名称...')} value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="pl-9 w-52 h-9" />
          </div>

          <Button variant={showFilters ? 'secondary' : 'outline'} size="sm" className="h-9 gap-1.5"
            onClick={() => setShowFilters(v => !v)}>
            <SlidersHorizontal className="size-3.5" />
            {t('筛选')}
            {activeFilterCount > 0 && (
              <Badge className="ml-0.5 size-4.5 text-[10px] px-1 h-4 min-w-4 bg-primary text-primary-foreground">
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground"
              onClick={clearAllFilters}>
              <X className="size-3.5" />{t('清除筛选')}
            </Button>
          )}

          {selectedInView.length > 0 && (
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5">
              <span className="text-xs text-destructive font-medium">{t('已选')} {selectedInView.length} {t('条')}</span>
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1.5" onClick={requestDeleteBatch}>
                <Trash2 className="size-3.5" />{t('批量删除')}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
                {t('取消选择')}
              </Button>
            </div>
          )}
        </div>

        {showFilters && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
            className="flex flex-wrap gap-2 items-center p-3 rounded-xl bg-muted/30 border border-border/50">
            <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v)}>
              <SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder={t('状态')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('全部状态')}</SelectItem>
                <SelectItem value="1">{t('已启用')}</SelectItem>
                <SelectItem value="2">{t('已禁用')}</SelectItem>
                <SelectItem value="3">{t('自动禁用')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={(v: string) => setTypeFilter(v)}>
              <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder={t('渠道类型')} /></SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="all">{t('全部类型')}</SelectItem>
                <Separator className="my-1" />
                {Object.entries(CHANNEL_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {availableGroups.length > 0 && (
              <Select value={groupFilter} onValueChange={(v: string) => setGroupFilter(v)}>
                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder={t('用户分组')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('全部分组')}</SelectItem>
                  <Separator className="my-1" />
                  {availableGroups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <p className="text-xs text-muted-foreground ml-auto">
              {t('筛选在已加载数据中生效')}
            </p>
          </motion.div>
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
                    <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                  </TableHead>
                  <TableHead className="w-12">ID</TableHead>
                  <TableHead>{t('名称')}</TableHead>
                  <TableHead>{t('类型')}</TableHead>
                  <TableHead>{t('状态')}</TableHead>
                  <TableHead>{t('分组')}</TableHead>
                  <TableHead className="text-right">{t('响应时间')}</TableHead>
                  <TableHead className="text-right">{t('已用额度')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('测试时间')}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : filteredChannels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-14 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2.5">
                        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
                          <Layers className="size-6 opacity-30" />
                        </div>
                        <p className="text-sm">
                          {activeFilterCount > 0 ? t('未找到匹配的渠道') : t('还没有渠道，点击右上角添加')}
                        </p>
                        {activeFilterCount === 0 && (
                          <Button size="sm" variant="outline" className="mt-1" onClick={openCreate}>
                            <Plus className="size-4 mr-1.5" />{t('添加第一个渠道')}
                          </Button>
                        )}
                        {activeFilterCount > 0 && (
                          <Button size="sm" variant="outline" className="mt-1" onClick={clearAllFilters}>
                            <X className="size-4 mr-1.5" />{t('清除筛选')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredChannels.map((channel) => {
                    const isChecked = selected.has(channel.id);
                    const typeLabel = CHANNEL_TYPES[channel.type] || `Type ${channel.type}`;
                    const groups = (channel.group || 'default').split(',').map((s: string) => s.trim()).filter(Boolean);
                    return (
                      <TableRow key={channel.id} className={cn(
                        'hover:bg-muted/50 transition-colors',
                        channel.status !== 1 && 'opacity-70',
                        isChecked && 'bg-primary/5',
                      )}>
                        <TableCell className="pl-4">
                          <Checkbox checked={isChecked} onChange={() => toggleSelect(channel.id)} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{channel.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={cn('size-2 rounded-full shrink-0',
                              channel.status === 1 ? 'bg-emerald-500' : channel.status === 3 ? 'bg-amber-400' : 'bg-destructive/60')} />
                            <span className="font-medium text-sm">{channel.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-mono">{typeLabel}</Badge>
                        </TableCell>
                        <TableCell>
                          <ChannelStatusBadge status={channel.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {groups.slice(0, 2).map(g => (
                              <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{g}</span>
                            ))}
                            {groups.length > 2 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">+{groups.length - 2}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-right">
                          {channel.response_time
                            ? <span className={cn(
                                channel.response_time < 1000 ? 'text-emerald-600 dark:text-emerald-400' :
                                channel.response_time < 3000 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive')}>
                                {(channel.response_time / 1000).toFixed(2)}s
                              </span>
                            : <span className="text-muted-foreground/50">-</span>}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {channel.used_quota != null ? formatQuota(channel.used_quota, status) : '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {channel.tested_time ? formatTimestamp(channel.tested_time) : '-'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEdit(channel)}>
                                <Pencil className="size-4 mr-2 text-muted-foreground" />{t('编辑')}
                              </DropdownMenuItem>
                              <TestMenuItem channelId={channel.id}
                                onResult={(ms) => handleTestResult(channel.id, ms)} />
                              <DropdownMenuItem onClick={() => handleToggleStatus(channel)}>
                                {channel.status === 1
                                  ? <><XCircle className="size-4 mr-2 text-muted-foreground" />{t('禁用')}</>
                                  : <><Zap className="size-4 mr-2 text-emerald-500" />{t('启用')}</>}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive"
                                onClick={() => requestDeleteSingle(channel.id)}>
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

            {/* Pagination */}
            {!loading && totalItems > 0 && (
              <div className="border-t border-border/40 px-4">
                <Pagination
                  currentPage={currentPage}
                  totalItems={totalItems}
                  pageSize={PAGE_SIZE}
                  onPageChange={setCurrentPage}
                  disabled={loading}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <ChannelDialog open={dialogOpen} onOpenChange={setDialogOpen}
        editChannel={editChannel} onDone={() => fetchChannels(currentPage)} />

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={confirmTarget === 'batch'
          ? `${t('批量删除')} ${selectedInView.length} ${t('个渠道')}`
          : t('删除渠道')}
        description={confirmDescription}
        onConfirm={handleConfirmDelete}
        loading={confirmLoading} />
    </div>
  );
}

export default function ChannelPage() {
  return (
    <AuthGuard requireAdmin>
      <ChannelContent />
    </AuthGuard>
  );
}
