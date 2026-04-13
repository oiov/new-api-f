"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Gift,
  CalendarCheck,
  Loader2,
  History,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import Turnstile, { type BoundTurnstileObject } from "react-turnstile";
import { API } from "@/lib/api";
import { formatQuota } from "@/lib/utils";
import { useSystemStatus } from "@/context/status-context";
import { toast } from "sonner";

interface CheckinRecord {
  checkin_date: string; // YYYY-MM-DD
  quota_awarded: number;
}

interface CheckinStats {
  checked_in_today: boolean;
  total_checkins: number;
  total_quota: number;
  checkin_count: number;
  records: CheckinRecord[];
}

interface CheckinData {
  enabled: boolean;
  min_quota: number;
  max_quota: number;
  stats: CheckinStats;
}

function getMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y} 年 ${parseInt(m)} 月`;
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const WEEK_DAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function CheckinCard() {
  const { t } = useTranslation();
  const status = useSystemStatus();

  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  const [data, setData] = useState<CheckinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<BoundTurnstileObject | null>(null);

  // History sheet state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(currentMonth);
  const [historyStats, setHistoryStats] = useState<CheckinStats | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchCheckin = useCallback(async (month: string) => {
    try {
      const res = await API.get(`/api/user/checkin?month=${month}`);
      const d = res.data as { success: boolean; data?: CheckinData };
      if (d.success && d.data) return d.data;
    } catch {
      // ignore
    }
    return null;
  }, []);

  useEffect(() => {
    fetchCheckin(currentMonth).then((d) => {
      if (d) setData(d);
      setLoading(false);
    });
  }, [fetchCheckin, currentMonth]);

  const fetchHistory = useCallback(
    async (month: string) => {
      setHistoryLoading(true);
      const d = await fetchCheckin(month);
      setHistoryStats(d?.stats ?? null);
      setHistoryLoading(false);
    },
    [fetchCheckin],
  );

  const handleHistoryOpenChange = (open: boolean) => {
    setHistoryOpen(open);
    if (open) {
      setHistoryMonth(currentMonth);
      fetchHistory(currentMonth);
    }
  };

  const changeHistoryMonth = (delta: number) => {
    const next = addMonths(historyMonth, delta);
    setHistoryMonth(next);
    fetchHistory(next);
  };

  const doCheckin = async () => {
    if (status?.turnstile_check && !turnstileToken) {
      toast.error(t("请稍后几秒重试，Turnstile 正在检查用户环境"));
      return;
    }
    setCheckinLoading(true);
    try {
      const url = status?.turnstile_check
        ? `/api/user/checkin?turnstile=${turnstileToken}`
        : "/api/user/checkin";
      const res = await API.post(url);
      const d = res.data as {
        success: boolean;
        data?: { quota_awarded: number };
        message?: string;
      };
      if (d.success) {
        toast.success(
          `${t("签到成功！获得")} ${formatQuota(d.data?.quota_awarded ?? 0, status)}`,
        );
        // Refresh current month data
        fetchCheckin(currentMonth).then((nd) => {
          if (nd) setData(nd);
        });
      } else {
        toast.error(d.message || t("签到失败"));
        // Reset Turnstile on failure so user can retry
        if (status?.turnstile_check) {
          setTurnstileToken("");
          turnstileRef.current?.reset();
        }
      }
    } catch {
      toast.error(t("签到失败"));
      if (status?.turnstile_check) {
        setTurnstileToken("");
        turnstileRef.current?.reset();
      }
    } finally {
      setCheckinLoading(false);
    }
  };

  // Don't render if backend has checkin disabled (wait until status loaded)
  if (status !== undefined && !status.checkin_enabled) return null;

  const stats = data?.stats;
  const checkedToday = stats?.checked_in_today ?? false;
  const openPricingPage = () => {
    window.open("https://nbility.dev/pricing?currency=CNY", "_blank");
  };

  // Calendar computation for history sheet
  const [hy, hm] = historyMonth.split("-").map(Number);
  const daysInMonth = new Date(hy, hm, 0).getDate();
  const firstDayOfWeek = new Date(hy, hm - 1, 1).getDay();
  const checkedDates = new Set(
    historyStats?.records?.map((r) => r.checkin_date) ?? [],
  );
  const recordMap = new Map(
    historyStats?.records?.map((r) => [r.checkin_date, r.quota_awarded]) ?? [],
  );

  if (loading) {
    return (
      <Card className="card-pro">
        <CardContent className="p-5 flex items-center gap-3">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t("加载签到状态...")}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-pro overflow-hidden">
      <CardContent className="p-0">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/80 to-gold" />
        <div className="p-5">
          <div className="flex items-center justify-between gap-4">
            {/* Left: icon + title */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CalendarCheck className="size-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">{t("每日签到")}</h3>
                  {checkedToday && (
                    <Badge className="bg-success/10 text-success border-success/20 text-[10px] h-4 px-1.5">
                      {t("今日已签")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("每天签到获取免费额度奖励")}
                </p>
              </div>
            </div>

            {/* Center: stats (desktop) */}
            <div className="hidden sm:flex items-center gap-5 shrink-0">
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">
                  {stats?.checkin_count ?? 0}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {t("本月签到")}
                </p>
              </div>
              <div className="w-px h-8 bg-border/60" />
              <div className="text-center">
                <p className="text-lg font-bold text-primary">
                  {formatQuota(stats?.total_quota ?? 0, status)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {t("累计获得")}
                </p>
              </div>
            </div>

            {/* Right: history + checkin buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <Sheet open={historyOpen} onOpenChange={handleHistoryOpenChange}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <History className="size-3.5" />
                    <span className="hidden sm:inline">{t("签到历史")}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-[360px] sm:w-[420px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <CalendarCheck className="size-4 text-primary" />
                      {t("签到历史")}
                    </SheetTitle>
                  </SheetHeader>

                  <div className="mt-5 space-y-4">
                    {/* Month navigation */}
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => changeHistoryMonth(-1)}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="text-sm font-medium">
                        {getMonthLabel(historyMonth)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => changeHistoryMonth(1)}
                        disabled={historyMonth >= currentMonth}>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>

                    {historyLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        {/* Calendar */}
                        <div>
                          {/* Week day headers */}
                          <div className="grid grid-cols-7 mb-1">
                            {WEEK_DAYS.map((d) => (
                              <div
                                key={d}
                                className="text-center text-[10px] text-muted-foreground py-1 font-medium">
                                {d}
                              </div>
                            ))}
                          </div>
                          {/* Day cells */}
                          <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: firstDayOfWeek }).map(
                              (_, i) => (
                                <div key={`pad-${i}`} />
                              ),
                            )}
                            {Array.from(
                              { length: daysInMonth },
                              (_, i) => i + 1,
                            ).map((day) => {
                              const dateStr = `${historyMonth}-${String(day).padStart(2, "0")}`;
                              const checked = checkedDates.has(dateStr);
                              const quota = recordMap.get(dateStr);
                              const isToday = dateStr === today;
                              const isFuture = dateStr > today;
                              return (
                                <div
                                  key={day}
                                  title={
                                    quota !== undefined
                                      ? `+${formatQuota(quota, status)}`
                                      : undefined
                                  }
                                  className={[
                                    "relative aspect-square flex items-center justify-center text-xs rounded-lg transition-colors",
                                    checked
                                      ? "bg-primary text-primary-foreground font-semibold"
                                      : isFuture
                                        ? "text-muted-foreground/40"
                                        : "text-foreground hover:bg-muted/60",
                                    isToday && !checked
                                      ? "ring-1 ring-primary ring-offset-1"
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}>
                                  {day}
                                  {checked && (
                                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary-foreground/50" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Month summary */}
                        <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t("本月签到天数")}
                            </span>
                            <span className="font-medium">
                              {historyStats?.checkin_count ?? 0} {t("天")}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t("累计签到天数")}
                            </span>
                            <span className="font-medium">
                              {historyStats?.total_checkins ?? 0} {t("天")}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t("累计获得额度")}
                            </span>
                            <span className="font-medium text-primary">
                              {formatQuota(
                                historyStats?.total_quota ?? 0,
                                status,
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Records list */}
                        {historyStats?.records &&
                        historyStats.records.length > 0 ? (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground px-1">
                              {t("签到记录")}
                            </p>
                            {historyStats.records.map((r) => (
                              <div
                                key={r.checkin_date}
                                className="flex items-center justify-between text-sm py-2 px-3 rounded-md hover:bg-muted/40 transition-colors">
                                <span className="text-muted-foreground">
                                  {r.checkin_date}
                                </span>
                                <span className="font-medium text-primary">
                                  +{formatQuota(r.quota_awarded, status)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-center text-muted-foreground py-4">
                            {t("本月暂无签到记录")}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </SheetContent>
              </Sheet>

              <Button
                onClick={doCheckin}
                disabled={checkedToday || checkinLoading}
                size="sm"
                className="gap-1.5">
                {checkinLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Gift className="size-3.5" />
                )}
                {checkedToday ? t("今日已签到") : t("立即签到")}
              </Button>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-amber-200/70 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(255,255,255,0.96))] px-3 py-3 shadow-sm dark:border-amber-400/20 dark:bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(17,24,39,0.95))]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    <Sparkles className="size-3" />
                    {t("低价 Claude Codex 套餐")}
                  </span>
                  <span className="text-[11px] font-medium text-rose-500">
                    {t("限时优惠")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-foreground/90">
                  {t("限时优惠进行中，想先体验可以先看天卡和轻量套餐。")}
                </p>
              </div>
              <Button
                size="sm"
                onClick={openPricingPage}
                className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white">
                {t("去看看套餐")}
                <ArrowUpRight className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Mobile stats */}
          <div className="sm:hidden mt-3 pt-3 border-t border-border/40 flex items-center justify-around">
            <div className="text-center">
              <p className="text-base font-bold">{stats?.checkin_count ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">
                {t("本月签到")}
              </p>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-primary">
                {formatQuota(stats?.total_quota ?? 0, status)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {t("累计获得")}
              </p>
            </div>
          </div>

          {/* Turnstile widget — only rendered when backend requires it */}
          {status?.turnstile_check && status.turnstile_site_key && (
            <div className="mt-3 flex justify-end">
              <Turnstile
                sitekey={status.turnstile_site_key}
                onVerify={(token, bound) => {
                  setTurnstileToken(token);
                  turnstileRef.current = bound;
                }}
                onExpire={(_token, bound) => {
                  setTurnstileToken("");
                  turnstileRef.current = bound;
                }}
                size="compact"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
