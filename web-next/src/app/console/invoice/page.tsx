'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  FileText,
  Plus,
  Download,
  Mail,
  CheckCircle,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { AuthGuard } from '@/components/common/auth-guard';
import { toast } from 'sonner';

const MIN_INVOICE_AMOUNT = 50;

interface TopUp {
  id: number;
  money: number;
  trade_no: string;
  payment_method: string;
  complete_time: number;
  status: string;
}

interface Invoice {
  id: number;
  title: string;
  tax_id: string;
  email: string;
  amount: number;
  status: string;
  file_url: string;
  remark: string;
  create_time: number;
}

const PAYMENT_METHOD_MAP: Record<string, string> = {
  stripe: 'Stripe',
  epay: '易支付',
  creem: 'Creem',
  waffo: 'Waffo',
  manual: '管理员充值',
};

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending: { label: '审核中', variant: 'secondary', icon: <Clock className="size-3" /> },
  issued: { label: '已开具', variant: 'default', icon: <CheckCircle className="size-3" /> },
  sent: { label: '已发送', variant: 'default', icon: <Mail className="size-3" /> },
  rejected: { label: '已拒绝', variant: 'destructive', icon: <XCircle className="size-3" /> },
};

function timestamp2string(ts: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function InvoicePage() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [invoiceableTopUps, setInvoiceableTopUps] = useState<TopUp[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [topupsLoading, setTopupsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [invoiceTitle, setInvoiceTitle] = useState('');
  const [taxId, setTaxId] = useState('');
  const [email, setEmail] = useState('');

  const fetchInvoices = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/invoice?page=${p}&page_size=${pageSize}`);
      const data = await res.json();
      if (data.message === 'success') {
        setInvoices(data.data?.items || []);
        setTotal(data.data?.total || 0);
      }
    } catch {
      toast.error(t('获取发票列表失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchInvoiceableTopUps = async () => {
    setTopupsLoading(true);
    try {
      const res = await fetch('/api/user/invoice/invoiceable');
      const data = await res.json();
      if (data.message === 'success') {
        setInvoiceableTopUps(data.data || []);
      }
    } catch {
      toast.error(t('获取充值记录失败'));
    } finally {
      setTopupsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices(page);
  }, [page, fetchInvoices]);

  const openRequestModal = () => {
    setShowRequestModal(true);
    setSelectedIds([]);
    setInvoiceTitle('');
    setTaxId('');
    setEmail('');
    fetchInvoiceableTopUps();
  };

  const selectedAmount = useMemo(() => {
    return invoiceableTopUps
      .filter((t) => selectedIds.includes(t.id))
      .reduce((sum, t) => sum + t.money, 0);
  }, [invoiceableTopUps, selectedIds]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === invoiceableTopUps.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(invoiceableTopUps.map((t) => t.id));
    }
  };

  const handleSubmitInvoice = async () => {
    if (selectedIds.length === 0) {
      toast.warning(t('请选择至少一条充值记录'));
      return;
    }
    if (selectedAmount < MIN_INVOICE_AMOUNT) {
      toast.warning(t('开票金额不足 {{min}} 元（当前 {{current}} 元）', {
        min: MIN_INVOICE_AMOUNT,
        current: selectedAmount.toFixed(2),
      }));
      return;
    }
    if (!invoiceTitle.trim()) {
      toast.warning(t('请输入发票抬头'));
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.warning(t('请输入有效的邮箱地址'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/user/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topup_ids: selectedIds,
          title: invoiceTitle.trim(),
          tax_id: taxId.trim(),
          email: email.trim(),
        }),
      });
      const data = await res.json();
      if (data.message === 'success') {
        toast.success(t('发票申请提交成功'));
        setShowRequestModal(false);
        fetchInvoices(1);
      } else {
        toast.error(data.data || t('提交失败，请稍后重试'));
      }
    } catch {
      toast.error(t('提交失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthGuard>
      <div className="p-4 md:p-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold">{t('发票管理')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('申请开具发票，最低开票金额 {{min}} 元', { min: MIN_INVOICE_AMOUNT })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchInvoices(page)}>
              <RefreshCw className="size-4 mr-1" />
              {t('刷新')}
            </Button>
            <Button size="sm" onClick={openRequestModal}>
              <Plus className="size-4 mr-1" />
              {t('申请开票')}
            </Button>
          </div>
        </motion.div>

        {/* Invoice List */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <FileText className="size-12 mx-auto mb-3 opacity-30" />
                <p>{t('暂无发票记录')}</p>
                <Button className="mt-4" variant="outline" onClick={openRequestModal}>
                  {t('立即申请')}
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('申请时间')}</TableHead>
                      <TableHead>{t('发票抬头')}</TableHead>
                      <TableHead>{t('税号')}</TableHead>
                      <TableHead>{t('金额')}</TableHead>
                      <TableHead>{t('状态')}</TableHead>
                      <TableHead>{t('邮箱')}</TableHead>
                      <TableHead>{t('操作')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => {
                      const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.pending;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="text-sm">{timestamp2string(inv.create_time)}</TableCell>
                          <TableCell className="font-medium">{inv.title}</TableCell>
                          <TableCell className="text-muted-foreground">{inv.tax_id || '—'}</TableCell>
                          <TableCell>
                            <span className="font-semibold">¥{Number(inv.amount).toFixed(2)}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant} className="gap-1">
                              {cfg.icon}{t(cfg.label)}
                            </Badge>
                            {inv.status === 'rejected' && inv.remark && (
                              <p className="text-xs text-destructive mt-1">{inv.remark}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{inv.email}</TableCell>
                          <TableCell>
                            {(inv.status === 'issued' || inv.status === 'sent') && inv.file_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(inv.file_url, '_blank')}
                              >
                                <Download className="size-3 mr-1" />
                                {t('下载')}
                              </Button>
                            )}
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

        {/* Pagination */}
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
              {page} / {Math.ceil(total / pageSize)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('下一页')}
            </Button>
          </div>
        )}

        {/* Request Invoice Modal */}
        <Dialog open={showRequestModal} onOpenChange={setShowRequestModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('申请开票')}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300">
                {t('请勾选需要开票的充值记录，合计金额须满 {{min}} 元', { min: MIN_INVOICE_AMOUNT })}
              </div>

              {/* Topup selection table */}
              <div className="border rounded-lg overflow-hidden">
                {topupsLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : invoiceableTopUps.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    {t('暂无可开票的充值记录（充值成功且未开票）')}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            className="cursor-pointer"
                            checked={selectedIds.length === invoiceableTopUps.length && invoiceableTopUps.length > 0}
                            onChange={toggleAll}
                          />
                        </TableHead>
                        <TableHead>{t('充值时间')}</TableHead>
                        <TableHead>{t('支付方式')}</TableHead>
                        <TableHead>{t('金额（元）')}</TableHead>
                        <TableHead>{t('订单号')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceableTopUps.map((topup) => (
                        <TableRow
                          key={topup.id}
                          className="cursor-pointer"
                          onClick={() => toggleSelect(topup.id)}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              className="cursor-pointer"
                              checked={selectedIds.includes(topup.id)}
                              onChange={() => toggleSelect(topup.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>
                          <TableCell className="text-sm">{timestamp2string(topup.complete_time)}</TableCell>
                          <TableCell>{PAYMENT_METHOD_MAP[topup.payment_method] || topup.payment_method}</TableCell>
                          <TableCell className="font-semibold">¥{Number(topup.money).toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">
                            {topup.trade_no}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Selected amount summary */}
              <div className="flex justify-between items-center px-1">
                <span className="text-sm text-muted-foreground">
                  {t('已选 {{count}} 条', { count: selectedIds.length })}
                </span>
                <span className="font-semibold">
                  {t('合计')}：
                  <span className={selectedAmount >= MIN_INVOICE_AMOUNT ? 'text-green-600' : 'text-destructive'}>
                    ¥{selectedAmount.toFixed(2)}
                  </span>
                </span>
              </div>

              {/* Invoice info form */}
              <div className="border-t pt-4 space-y-3">
                <div>
                  <Label htmlFor="inv-title">
                    {t('发票抬头')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="inv-title"
                    placeholder={t('个人姓名或企业名称')}
                    value={invoiceTitle}
                    onChange={(e) => setInvoiceTitle(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="inv-tax">{t('税号（选填）')}</Label>
                  <Input
                    id="inv-tax"
                    placeholder={t('企业纳税人识别号，个人可不填')}
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="inv-email">
                    {t('接收邮箱')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="inv-email"
                    type="email"
                    placeholder={t('发票将发送至此邮箱')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRequestModal(false)}>
                {t('取消')}
              </Button>
              <Button onClick={handleSubmitInvoice} disabled={submitting}>
                {submitting ? t('提交中...') : t('提交申请')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  );
}
