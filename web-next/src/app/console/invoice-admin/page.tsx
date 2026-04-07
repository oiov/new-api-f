'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  FileCheck,
  List,
  Eye,
  Download,
  Mail,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  Upload,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AuthGuard } from '@/components/common/auth-guard';
import { API } from '@/lib/api';
import { toast } from 'sonner';
import { useIsAdmin } from '@/context/user-context';

// ─── 类型定义 ───────────────────────────────────────────────

interface Invoice {
  id: number;
  user_id: number;
  username: string;
  title: string;
  tax_id: string;
  email: string;
  amount: number;
  topup_ids: string;
  status: 'pending' | 'issued' | 'sent' | 'rejected';
  file_url: string;
  remark: string;
  create_time: number;
  update_time: number;
}

interface TopUp {
  id: number;
  money: number;
  trade_no: string;
  payment_method: string;
  complete_time: number;
  status: string;
}

// ─── 常量 ───────────────────────────────────────────────────

const PAYMENT_METHOD_MAP: Record<string, string> = {
  stripe: 'Stripe',
  epay: '易支付',
  creem: 'Creem',
  waffo: 'Waffo',
  manual: '管理员充值',
};

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: React.ReactNode;
  }
> = {
  pending: {
    label: '审核中',
    variant: 'secondary',
    icon: <Clock className="size-3" />,
  },
  issued: {
    label: '已开具',
    variant: 'default',
    icon: <CheckCircle className="size-3" />,
  },
  sent: {
    label: '已发送',
    variant: 'default',
    icon: <Mail className="size-3" />,
  },
  rejected: {
    label: '已拒绝',
    variant: 'destructive',
    icon: <XCircle className="size-3" />,
  },
};

function timestamp2string(ts: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isImageUrl(url: string) {
  return /\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?.*)?$/i.test(url);
}

// ─── 主页面 ─────────────────────────────────────────────────

export default function InvoiceAdminPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();

  // 列表状态
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // 筛选
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // 开具 Dialog
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [issueRemark, setIssueRemark] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [issuing, setIssuing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 拒绝 Dialog
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectRemark, setRejectRemark] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // 发送邮件 Dialog
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [sending, setSending] = useState(false);

  // 关联订单 Dialog
  const [showTopupsDialog, setShowTopupsDialog] = useState(false);
  const [topups, setTopups] = useState<TopUp[]>([]);
  const [topupsLoading, setTopupsLoading] = useState(false);

  // 图片预览 Dialog
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  // ── 数据获取 ────────────────────────────────────────────

  const fetchInvoices = useCallback(
    async (p = 1, kw = keyword, status = statusFilter) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          page: p,
          page_size: pageSize,
        };
        if (kw.trim()) params.keyword = kw.trim();
        if (status !== 'all') params.status = status;

        const res = await API.get('/api/invoice/admin', { params });
        const data = res.data as {
          success: boolean;
          message?: string;
          data?: { items: Invoice[]; total: number };
        };
        if (data.success) {
          setInvoices(data.data?.items || []);
          setTotal(data.data?.total || 0);
        } else {
          toast.error(data.message || t('获取发票列表失败'));
        }
      } catch {
        toast.error(t('获取发票列表失败'));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    fetchInvoices(page, keyword, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleSearch = () => {
    setPage(1);
    fetchInvoices(1, keyword, statusFilter);
  };

  // ── 开具发票 ────────────────────────────────────────────

  const openIssueDialog = (inv: Invoice) => {
    setCurrentInvoice(inv);
    setFileUrl(inv.file_url || '');
    setIssueRemark('');
    setUploadedFileName('');
    setShowIssueDialog(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      toast.error(t('文件大小不能超过 20MB'));
      return;
    }

    setUploading(true);
    setUploadedFileName(file.name);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await API.post('/api/invoice/admin/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data as { success: boolean; data?: { url: string }; url?: string; message?: string };
      const url = data.data?.url || (data as { url?: string }).url || '';
      if (data.success && url) {
        setFileUrl(url);
        toast.success(t('文件上传成功'));
      } else {
        toast.error(data.message || t('文件上传失败'));
        setUploadedFileName('');
      }
    } catch {
      toast.error(t('文件上传失败'));
      setUploadedFileName('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleIssue = async () => {
    if (!currentInvoice) return;
    if (!fileUrl.trim()) {
      toast.warning(t('请上传发票文件或填写文件链接'));
      return;
    }
    setIssuing(true);
    try {
      const res = await API.put(`/api/invoice/admin/${currentInvoice.id}/issue`, {
        file_url: fileUrl.trim(),
        remark: issueRemark.trim(),
      });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(t('发票已成功开具'));
        setShowIssueDialog(false);
        fetchInvoices(page, keyword, statusFilter);
      } else {
        toast.error(data.message || t('开具失败，请稍后重试'));
      }
    } catch {
      toast.error(t('开具失败，请稍后重试'));
    } finally {
      setIssuing(false);
    }
  };

  // ── 拒绝 ────────────────────────────────────────────────

  const openRejectDialog = (inv: Invoice) => {
    setCurrentInvoice(inv);
    setRejectRemark('');
    setShowRejectDialog(true);
  };

  const handleReject = async () => {
    if (!currentInvoice) return;
    if (!rejectRemark.trim()) {
      toast.warning(t('请填写拒绝原因'));
      return;
    }
    setRejecting(true);
    try {
      const res = await API.put(`/api/invoice/admin/${currentInvoice.id}/reject`, {
        remark: rejectRemark.trim(),
      });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(t('已拒绝该发票申请'));
        setShowRejectDialog(false);
        fetchInvoices(page, keyword, statusFilter);
      } else {
        toast.error(data.message || t('操作失败，请稍后重试'));
      }
    } catch {
      toast.error(t('操作失败，请稍后重试'));
    } finally {
      setRejecting(false);
    }
  };

  // ── 发送邮件 ─────────────────────────────────────────────

  const openSendDialog = (inv: Invoice) => {
    setCurrentInvoice(inv);
    setSendEmail(inv.email || '');
    setShowSendDialog(true);
  };

  const handleSend = async () => {
    if (!currentInvoice) return;
    if (!sendEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendEmail)) {
      toast.warning(t('请输入有效的邮箱地址'));
      return;
    }
    setSending(true);
    try {
      const res = await API.post(`/api/invoice/admin/${currentInvoice.id}/send`, {
        email: sendEmail.trim(),
      });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(t('发票邮件已发送'));
        setShowSendDialog(false);
        fetchInvoices(page, keyword, statusFilter);
      } else {
        toast.error(data.message || t('发送失败，请稍后重试'));
      }
    } catch {
      toast.error(t('发送失败，请稍后重试'));
    } finally {
      setSending(false);
    }
  };

  // ── 关联订单 ─────────────────────────────────────────────

  const openTopupsDialog = async (inv: Invoice) => {
    setCurrentInvoice(inv);
    setTopups([]);
    setShowTopupsDialog(true);
    setTopupsLoading(true);
    try {
      const res = await API.get(`/api/invoice/admin/${inv.id}/topups`);
      const data = res.data as { success: boolean; data?: TopUp[]; message?: string };
      if (data.success) {
        setTopups(data.data || []);
      } else {
        toast.error(data.message || t('获取关联订单失败'));
      }
    } catch {
      toast.error(t('获取关联订单失败'));
    } finally {
      setTopupsLoading(false);
    }
  };

  // ── 图片预览 ─────────────────────────────────────────────

  const openPreview = (url: string) => {
    setPreviewUrl(url);
    setShowPreviewDialog(true);
  };

  // ─── 渲染 ───────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <AuthGuard>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <XCircle className="size-12 opacity-40" />
          <p className="text-lg font-medium">{t('无权限访问')}</p>
          <p className="text-sm">{t('仅管理员可访问发票开具管理页面')}</p>
        </div>
      </AuthGuard>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <AuthGuard>
      <TooltipProvider delayDuration={300}>
        <div className="space-y-6 pb-8">
          {/* 头部 */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FileCheck className="size-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{t('发票开具管理')}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('审核并开具用户发票申请')}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchInvoices(page, keyword, statusFilter)}
            >
              <RefreshCw className="size-4 mr-1" />
              {t('刷新')}
            </Button>
          </motion.div>

          {/* 筛选栏 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    {t('搜索')}
                  </Label>
                  <Input
                    placeholder={t('发票抬头 / 用户名 / 邮箱')}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="h-9"
                  />
                </div>
                <div className="w-40">
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    {t('状态')}
                  </Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => setStatusFilter(v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('全部')}</SelectItem>
                      <SelectItem value="pending">{t('审核中')}</SelectItem>
                      <SelectItem value="issued">{t('已开具')}</SelectItem>
                      <SelectItem value="sent">{t('已发送')}</SelectItem>
                      <SelectItem value="rejected">{t('已拒绝')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="h-9" onClick={handleSearch}>
                  <Search className="size-4 mr-1.5" />
                  {t('搜索')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 表格 */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : invoices.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground">
                  <FileCheck className="size-12 mx-auto mb-3 opacity-30" />
                  <p>{t('暂无发票申请记录')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">ID</TableHead>
                        <TableHead>{t('申请时间')}</TableHead>
                        <TableHead>{t('用户')}</TableHead>
                        <TableHead>{t('发票抬头')}</TableHead>
                        <TableHead>{t('税号')}</TableHead>
                        <TableHead>{t('金额')}</TableHead>
                        <TableHead>{t('邮箱')}</TableHead>
                        <TableHead>{t('状态')}</TableHead>
                        <TableHead>{t('操作')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => {
                        const cfg =
                          STATUS_CONFIG[inv.status] || STATUS_CONFIG.pending;
                        return (
                          <TableRow key={inv.id}>
                            <TableCell className="text-muted-foreground text-sm font-mono">
                              {inv.id}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {timestamp2string(inv.create_time)}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {inv.username || inv.user_id}
                            </TableCell>
                            <TableCell className="font-medium max-w-[160px] truncate">
                              {inv.title}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {inv.tax_id || '—'}
                            </TableCell>
                            <TableCell>
                              <span className="font-semibold">
                                ¥{Number(inv.amount).toFixed(2)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                              {inv.email}
                            </TableCell>
                            <TableCell>
                              <Badge variant={cfg.variant} className="gap-1 whitespace-nowrap">
                                {cfg.icon}
                                {t(cfg.label)}
                              </Badge>
                              {inv.status === 'rejected' && inv.remark && (
                                <p className="text-xs text-destructive mt-1 max-w-[120px] truncate">
                                  {inv.remark}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {/* 关联订单 — 所有状态 */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8"
                                      onClick={() => openTopupsDialog(inv)}
                                    >
                                      <List className="size-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('关联订单')}</TooltipContent>
                                </Tooltip>

                                {/* pending 专属：开具 + 拒绝 */}
                                {inv.status === 'pending' && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="size-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                                          onClick={() => openIssueDialog(inv)}
                                        >
                                          <CheckCircle className="size-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('开具发票')}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                          onClick={() => openRejectDialog(inv)}
                                        >
                                          <XCircle className="size-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('拒绝申请')}</TooltipContent>
                                    </Tooltip>
                                  </>
                                )}

                                {/* issued/sent 专属：预览 + 下载 + 发送邮件 */}
                                {(inv.status === 'issued' || inv.status === 'sent') &&
                                  inv.file_url && (
                                    <>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            onClick={() => {
                                              if (isImageUrl(inv.file_url)) {
                                                openPreview(inv.file_url);
                                              } else {
                                                window.open(inv.file_url, '_blank');
                                              }
                                            }}
                                          >
                                            <Eye className="size-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('预览发票')}</TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            onClick={() => window.open(inv.file_url, '_blank')}
                                          >
                                            <Download className="size-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('下载发票')}</TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            onClick={() => openSendDialog(inv)}
                                          >
                                            <Mail className="size-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('发送邮件')}</TooltipContent>
                                      </Tooltip>
                                    </>
                                  )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 分页 */}
          {total > pageSize && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('上一页')}
              </Button>
              <span className="py-1.5 px-3 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('下一页')}
              </Button>
            </div>
          )}

          {/* ── 开具发票 Dialog ── */}
          <Dialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t('开具发票')}</DialogTitle>
              </DialogHeader>

              {currentInvoice && (
                <div className="space-y-4">
                  {/* 发票信息摘要 */}
                  <div className="rounded-lg bg-muted/40 border p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('发票抬头')}</span>
                      <span className="font-medium">{currentInvoice.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('开票金额')}</span>
                      <span className="font-semibold">
                        ¥{Number(currentInvoice.amount).toFixed(2)}
                      </span>
                    </div>
                    {currentInvoice.tax_id && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('税号')}</span>
                        <span>{currentInvoice.tax_id}</span>
                      </div>
                    )}
                  </div>

                  {/* 文件上传区域 */}
                  <div>
                    <Label className="mb-2 block">
                      {t('上传发票文件')}
                      <span className="text-muted-foreground font-normal ml-1">
                        ({t('PDF / 图片，最大 20MB')})
                      </span>
                    </Label>

                    {/* 隐藏的 file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    <div
                      className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                      {uploading ? (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <RefreshCw className="size-6 animate-spin" />
                          <span className="text-sm">{t('上传中...')}</span>
                        </div>
                      ) : uploadedFileName && fileUrl ? (
                        <div className="flex flex-col items-center gap-2">
                          {isImageUrl(fileUrl) ? (
                            <img
                              src={fileUrl}
                              alt="preview"
                              className="max-h-32 rounded object-contain border"
                            />
                          ) : (
                            <div className="size-12 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                              <FileCheck className="size-6 text-blue-600" />
                            </div>
                          )}
                          <span className="text-sm font-medium text-green-600">
                            {uploadedFileName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t('点击重新上传')}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Upload className="size-6" />
                          <span className="text-sm">{t('点击或拖拽上传发票文件')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 或直接填写链接 */}
                  <div>
                    <Label htmlFor="file-url" className="mb-1.5 block">
                      {t('发票文件链接')}
                      <span className="text-muted-foreground font-normal ml-1">
                        ({t('也可直接粘贴已有链接')})
                      </span>
                    </Label>
                    <Input
                      id="file-url"
                      placeholder={t('也可直接粘贴已有的发票文件 URL')}
                      value={fileUrl}
                      onChange={(e) => {
                        setFileUrl(e.target.value);
                        if (!e.target.value) setUploadedFileName('');
                      }}
                    />
                  </div>

                  {/* 备注 */}
                  <div>
                    <Label htmlFor="issue-remark" className="mb-1.5 block">
                      {t('备注（选填）')}
                    </Label>
                    <Textarea
                      id="issue-remark"
                      placeholder={t('可填写开票说明或备注信息')}
                      value={issueRemark}
                      onChange={(e) => setIssueRemark(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowIssueDialog(false)}
                >
                  {t('取消')}
                </Button>
                <Button onClick={handleIssue} disabled={issuing || uploading}>
                  {issuing ? t('开具中...') : t('确认开具')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── 拒绝 Dialog ── */}
          <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t('拒绝发票申请')}</DialogTitle>
              </DialogHeader>

              {currentInvoice && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/40 border p-3 text-sm">
                    <span className="text-muted-foreground">{t('申请人')}：</span>
                    <span className="font-medium">{currentInvoice.username}</span>
                    <span className="mx-2 text-muted-foreground">|</span>
                    <span className="text-muted-foreground">{t('金额')}：</span>
                    <span className="font-semibold">
                      ¥{Number(currentInvoice.amount).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <Label htmlFor="reject-remark" className="mb-1.5 block">
                      {t('拒绝原因')} <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="reject-remark"
                      placeholder={t('请填写拒绝原因，将展示给用户')}
                      value={rejectRemark}
                      onChange={(e) => setRejectRemark(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowRejectDialog(false)}
                >
                  {t('取消')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={rejecting}
                >
                  {rejecting ? t('处理中...') : t('确认拒绝')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── 发送邮件 Dialog ── */}
          <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t('发送发票邮件')}</DialogTitle>
              </DialogHeader>

              {currentInvoice && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/40 border p-3 text-sm">
                    <span className="text-muted-foreground">{t('发票抬头')}：</span>
                    <span className="font-medium">{currentInvoice.title}</span>
                  </div>
                  <div>
                    <Label htmlFor="send-email" className="mb-1.5 block">
                      {t('接收邮箱')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="send-email"
                      type="email"
                      value={sendEmail}
                      onChange={(e) => setSendEmail(e.target.value)}
                      placeholder={t('输入接收发票的邮箱地址')}
                    />
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowSendDialog(false)}
                >
                  {t('取消')}
                </Button>
                <Button onClick={handleSend} disabled={sending}>
                  <Mail className="size-4 mr-1.5" />
                  {sending ? t('发送中...') : t('发送')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── 关联订单 Dialog ── */}
          <Dialog open={showTopupsDialog} onOpenChange={setShowTopupsDialog}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('关联充值订单')}</DialogTitle>
              </DialogHeader>

              {currentInvoice && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/40 border p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('发票抬头')}</span>
                      <span className="font-medium">{currentInvoice.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('开票金额')}</span>
                      <span className="font-semibold">
                        ¥{Number(currentInvoice.amount).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {topupsLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : topups.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">
                      {t('暂无关联充值订单')}
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('充值时间')}</TableHead>
                            <TableHead>{t('支付方式')}</TableHead>
                            <TableHead>{t('金额')}</TableHead>
                            <TableHead>{t('订单号')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topups.map((topup) => (
                            <TableRow key={topup.id}>
                              <TableCell className="text-sm whitespace-nowrap">
                                {timestamp2string(topup.complete_time)}
                              </TableCell>
                              <TableCell>
                                {PAYMENT_METHOD_MAP[topup.payment_method] ||
                                  topup.payment_method}
                              </TableCell>
                              <TableCell className="font-semibold">
                                ¥{Number(topup.money).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
                                {topup.trade_no}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowTopupsDialog(false)}
                >
                  {t('关闭')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── 图片预览 Dialog ── */}
          <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t('发票预览')}</DialogTitle>
              </DialogHeader>

              <div className="flex justify-center items-center">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="invoice preview"
                    className="max-h-[70vh] max-w-full rounded object-contain border"
                  />
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowPreviewDialog(false)}
                >
                  {t('关闭')}
                </Button>
                <Button onClick={() => window.open(previewUrl, '_blank')}>
                  <Download className="size-4 mr-1.5" />
                  {t('下载')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    </AuthGuard>
  );
}
