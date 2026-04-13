"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Users,
  MessageCircleMore,
  QrCode,
  Headphones,
  Clock,
  ShieldCheck,
  ArrowUpRight,
  Copy,
  Phone,
} from "lucide-react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, copy } from "@/lib/utils";
import { toast } from "sonner";

interface ContactCard {
  key: string;
  titleKey: string;
  subtitleKey: string;
  imageSrc: string;
  value?: string;
  copyValue?: string;
  actionLabelKey?: string;
  actionHref?: string;
  icon: React.ElementType;
  color: { text: string; bg: string; border: string; badge: string };
  toneKey: string;
}

const CONTACT_CARDS: ContactCard[] = [
  {
    key: "qq-group",
    titleKey: "QQ群",
    subtitleKey: "用于问题答疑，适合群内交流与经验分享",
    imageSrc: "/contact/qq_group.jpg",
    value: "373865837",
    copyValue: "373865837",
    actionLabelKey: "加入QQ群",
    actionHref: "https://qm.qq.com/q/XTxYUh2vOC",
    icon: Users,
    color: {
      text: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/20",
      badge: "bg-primary/15 text-primary",
    },
    toneKey: "热门社区",
  },
  {
    key: "wechat-account",
    titleKey: "微信号",
    subtitleKey: "用于发票开具及一对一沟通联系",
    imageSrc: "/contact/nbility_user.jpg",
    value: "nbility",
    copyValue: "nbility",
    icon: MessageCircleMore,
    color: {
      text: "text-success",
      bg: "bg-success/10",
      border: "border-success/20",
      badge: "bg-success/15 text-success",
    },
    toneKey: "一对一沟通",
  },
  {
    key: "wechat-group",
    titleKey: "微信群",
    subtitleKey: "接收公告与通知，适合了解最新动态",
    imageSrc: "/contact/wechat_group.png",
    icon: QrCode,
    color: {
      text: "text-warning",
      bg: "bg-warning/10",
      border: "border-warning/20",
      badge: "bg-warning/15 text-warning",
    },
    toneKey: "活动通知",
  },
  {
    key: "qq-service",
    titleKey: "QQ客服",
    subtitleKey: "技术支持，处理账号、接入与售后问题",
    imageSrc: "/contact/qq.png",
    value: "2013571175",
    copyValue: "2013571175",
    icon: Headphones,
    color: {
      text: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-50 dark:bg-rose-900/20",
      border: "border-rose-200/60 dark:border-rose-800/40",
      badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    },
    toneKey: "官方支持",
  },
];

const HIGHLIGHTS = [
  {
    key: "response",
    icon: Clock,
    titleKey: "通常 10 分钟内回复",
    descKey: "工作时段内优先处理账号、支付与接入相关问题",
  },
  {
    key: "community",
    icon: Users,
    titleKey: "社区答疑更高效",
    descKey: "常见问题建议优先进群，方便同步最新公告与经验",
  },
  {
    key: "support",
    icon: ShieldCheck,
    titleKey: "官方渠道更可靠",
    descKey: "统一使用页面展示的联系方式，避免误加非官方账号",
  },
];

const NOTES = [
  "如二维码失效，可先复制账号后通过客户端手动搜索添加",
  "涉及订单、账号、额度等问题时，联系时附上必要信息会更快定位",
  "群聊主要用于交流与公告，同类问题请尽量集中在同一渠道沟通",
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function ContactPage() {
  const { t } = useTranslation();
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [previewSrc, setPreviewSrc] = useState("");

  const handleCopy = async (value: string) => {
    const ok = await copy(value);
    if (ok) toast.success(t("已复制到剪贴板"));
    else toast.error(t("复制失败，请重试"));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-10">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Phone className="size-5 text-primary" />
          </div>
          <div>
            <span className="text-xs font-semibold text-primary uppercase tracking-widest">
              {t("官方联系通道")}
            </span>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("联系我们")}
            </h1>
          </div>
        </div>

        <p className="text-muted-foreground max-w-xl leading-relaxed">
          {t(
            "欢迎加入社区或联系官方客服，选择最适合你的渠道，我们把常用入口整理在一个页面里。",
          )}
        </p>

        {/* 特性高亮 */}
        <div className="grid sm:grid-cols-3 gap-4">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className="flex gap-3 p-3.5 rounded-xl bg-muted/40 border border-border/50">
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t(item.titleKey)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {t(item.descKey)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* 快速操作 */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() =>
              window.open("https://qm.qq.com/q/XTxYUh2vOC", "_blank")
            }
            className="gap-2">
            <Users className="size-4" />
            {t("加入QQ群")}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => handleCopy("nbility")}>
            <Copy className="size-4" />
            {t("复制微信号")}
          </Button>
        </div>
      </motion.div>

      {/* 联系卡片网格 */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid sm:grid-cols-2 gap-4">
        {CONTACT_CARDS.map((card) => {
          const Icon = card.icon;
          const imgFailed = failedImages.has(card.key);

          return (
            <motion.div key={card.key} variants={itemVariants}>
              <Card
                className={cn("border shadow-card h-full", card.color.border)}>
                <CardContent className="p-5 flex flex-col gap-4 h-full">
                  {/* 头部 */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "size-9 rounded-lg flex items-center justify-center shrink-0",
                          card.color.bg,
                        )}>
                        <Icon className={cn("size-4", card.color.text)} />
                      </div>
                      <div>
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                            card.color.badge,
                          )}>
                          {t(card.toneKey)}
                        </span>
                        <p className="text-sm font-semibold mt-0.5">
                          {t(card.titleKey)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(card.subtitleKey)}
                        </p>
                      </div>
                    </div>
                    {card.copyValue && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 shrink-0"
                        onClick={() => handleCopy(card.copyValue!)}>
                        <Copy className="size-3" />
                        {t("复制")}
                      </Button>
                    )}
                  </div>

                  {/* 账号 + 二维码 */}
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {t("联系账号")}
                      </p>
                      {card.value ? (
                        <p className="text-lg font-bold font-mono tracking-wide">
                          {card.value}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t("扫码加入")}
                        </p>
                      )}
                    </div>

                    {/* 二维码预览 */}
                    <div className="relative size-16 rounded-lg overflow-hidden border border-border/60 shrink-0 bg-muted/30 flex items-center justify-center">
                      {imgFailed ? (
                        <QrCode className="size-6 text-muted-foreground/30" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPreviewSrc(card.imageSrc)}
                          className="size-full">
                          <Image
                            src={card.imageSrc}
                            alt={t(card.titleKey)}
                            fill
                            sizes="64px"
                            className="object-cover cursor-zoom-in"
                            onError={() =>
                              setFailedImages(
                                (prev) => new Set([...prev, card.key]),
                              )
                            }
                          />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-2">
                    {card.actionHref ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 text-xs h-8"
                        onClick={() => window.open(card.actionHref, "_blank")}>
                        <ArrowUpRight className="size-3.5" />
                        {t(card.actionLabelKey!)}
                      </Button>
                    ) : card.copyValue ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 text-xs h-8"
                        onClick={() => handleCopy(card.copyValue!)}>
                        <Copy className="size-3.5" />
                        {t("复制")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-8"
                        onClick={() => setPreviewSrc(card.imageSrc)}>
                        {t("查看二维码")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* 联系说明 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}>
        <Card className="border-border/50 shadow-card">
          <CardContent className="pt-5 pb-5">
            <p className="text-sm font-semibold mb-3">
              {t("为了更快处理问题，联系时建议准备这些信息")}
            </p>
            <ul className="space-y-2">
              {NOTES.map((note) => (
                <li
                  key={note}
                  className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-primary/60 shrink-0 mt-1.5" />
                  {t(note)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* 图片预览弹窗 */}
      {previewSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setPreviewSrc("")}>
          <motion.img
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            src={previewSrc}
            alt="preview"
            className="max-w-xs max-h-[80vh] rounded-xl shadow-2xl border border-white/20"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
