"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  Play,
  FileText,
  Github,
  ChevronRight,
  Zap,
  Shield,
  BarChart3,
  RefreshCw,
  Users,
  Globe,
  ArrowRight,
  CheckCircle2,
  Server,
  Clock,
  TrendingUp,
  Key,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSystemStatus } from "@/context/status-context";
import { useTheme } from "next-themes";
import { API } from "@/lib/api";
import { copy } from "@/lib/utils";
import { toast } from "sonner";

// ─── Cache helpers ─────────────────────────────────────────────────────────────
const HOME_PAGE_CACHE_KEY = "home_page_content_cache_v2";
const HOME_PAGE_CACHE_TTL = 5 * 60 * 1000;

const API_ENDPOINTS = ["/v1", "/v1beta", "/v1/chat/completions"];

// ─── Provider data (NO emoji — colored letter avatars) ──────────────────────
const PROVIDER_LOGOS = [
  { name: "OpenAI", abbr: "OA", color: "#10A37F" },
  { name: "Claude", abbr: "CL", color: "#CC785C" },
  { name: "Gemini", abbr: "GM", color: "#4285F4" },
  { name: "Azure", abbr: "AZ", color: "#0078D4" },
  { name: "DeepSeek", abbr: "DS", color: "#1E40AF" },
  { name: "Qwen", abbr: "QW", color: "#FF6A00" },
  { name: "Mistral", abbr: "MI", color: "#FF7000" },
  { name: "Llama", abbr: "LL", color: "#7C3AED" },
  { name: "Cohere", abbr: "CO", color: "#39594D" },
  { name: "Bedrock", abbr: "BR", color: "#FF9900" },
  { name: "Vertex", abbr: "VX", color: "#34A853" },
  { name: "Midjourney", abbr: "MJ", color: "#6366F1" },
];

// ─── Feature cards ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Zap,
    title: "统一接口",
    desc: "一套 OpenAI 兼容接口，无缝对接 40+ AI 供应商，零改造成本迁移。",
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
  },
  {
    icon: RefreshCw,
    title: "负载均衡",
    desc: "多渠道自动轮询，智能故障转移，确保高可用与低延迟。",
    iconColor: "text-info",
    iconBg: "bg-info/10",
  },
  {
    icon: BarChart3,
    title: "用量分析",
    desc: "实时监控 Token 消耗、费用趋势与请求统计，数据透明可见。",
    iconColor: "text-success",
    iconBg: "bg-success/10",
  },
  {
    icon: Shield,
    title: "安全管控",
    desc: "多租户隔离，Token 权限精细化控制，速率限制防过载。",
    iconColor: "text-warning",
    iconBg: "bg-warning/10",
  },
  {
    icon: Users,
    title: "多用户计费",
    desc: "独立配额管理，按量/订阅计费，支持充值与礼品码兑换。",
    iconColor: "text-gold",
    iconBg: "bg-gold/10",
  },
  {
    icon: Globe,
    title: "多语言支持",
    desc: "内置中英法俄日越南语，国际化团队开箱即用。",
    iconColor: "text-violet-500",
    iconBg: "bg-violet-500/10",
  },
] as const;

// ─── Stats ─────────────────────────────────────────────────────────────────────
const STATS = [
  { icon: Server, value: "40+", label: "AI 供应商" },
  { icon: TrendingUp, value: "99.9%", label: "服务可用率" },
  { icon: Clock, value: "<50ms", label: "中位响应时延" },
  { icon: Key, value: "无限", label: "API 令牌" },
] as const;

// ─── Python code demo (non-translatable: code is universal) ───────────────────
const CODE_BEFORE = `from openai import OpenAI

client = OpenAI(
    base_url="https://api.openai.com/v1",
    api_key="sk-openai-xxxxxxxx"
)`;

const CODE_AFTER = `from openai import OpenAI

client = OpenAI(
    base_url="YOUR_GATEWAY_URL/v1",
    api_key="your-gateway-key"
)`;

// ─── Cache utils ───────────────────────────────────────────────────────────────
function readHomePageCache(): { content: string; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(HOME_PAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { content: string; timestamp: number };
    if (
      typeof parsed?.content !== "string" ||
      typeof parsed?.timestamp !== "number"
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeHomePageCache(content: string): void {
  localStorage.setItem(
    HOME_PAGE_CACHE_KEY,
    JSON.stringify({ content, timestamp: Date.now() }),
  );
}

async function parseMarkdownToHtml(content: string): Promise<string> {
  const { marked } = await import("marked");
  return marked.parse(content) as string;
}

// ─── Animation variants ────────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.4, ease: "easeOut" as const },
});

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const cardItem = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

// ─── Component ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { t, i18n } = useTranslation();
  const status = useSystemStatus();
  const { resolvedTheme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [homePageContent, setHomePageContent] = useState("");
  const [homePageLoaded, setHomePageLoaded] = useState(false);
  const [endpointIndex, setEndpointIndex] = useState(0);
  const [codeTab, setCodeTab] = useState<"before" | "after">("after");

  const serverAddress =
    status?.server_address ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const docsLink = status?.docs_link || "";
  const isDemoSite = status?.demo_site_enabled || false;
  const isChinese = i18n.language.startsWith("zh");

  // ── Load custom home page content ──
  const displayContent = useCallback(async () => {
    const cached = readHomePageCache();
    const hasFreshCache =
      cached && Date.now() - cached.timestamp <= HOME_PAGE_CACHE_TTL;
    if (cached) {
      setHomePageContent(cached.content);
      setHomePageLoaded(true);
    }
    if (hasFreshCache) return;
    try {
      const res = await API.get("/api/home_page_content");
      const { success, data } = res.data as { success: boolean; data: string };
      if (success) {
        let content = data;
        if (!data.startsWith("https://")) {
          content = await parseMarkdownToHtml(data);
        }
        setHomePageContent(content);
        writeHomePageCache(content);
      }
    } catch {
      /* ignore */
    } finally {
      setHomePageLoaded(true);
    }
  }, []);

  useEffect(() => {
    displayContent();
  }, [displayContent]);

  // ── Rotate API endpoints ──
  useEffect(() => {
    const timer = setInterval(() => {
      setEndpointIndex((prev) => (prev + 1) % API_ENDPOINTS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // ── Sync iframe theme/lang ──
  useEffect(() => {
    if (homePageContent.startsWith("https://") && iframeRef.current) {
      try {
        iframeRef.current.contentWindow?.postMessage(
          { themeMode: resolvedTheme },
          "*",
        );
        iframeRef.current.contentWindow?.postMessage(
          { lang: i18n.language },
          "*",
        );
      } catch {
        /* ignore */
      }
    }
  }, [resolvedTheme, i18n.language, homePageContent]);

  const handleCopy = async () => {
    const ok = await copy(serverAddress);
    if (ok) toast.success(t("已复制到剪切板"));
  };

  // ── Custom content rendering ──
  if (homePageLoaded && homePageContent) {
    if (homePageContent.startsWith("https://")) {
      return (
        <iframe
          ref={iframeRef}
          src={homePageContent}
          className="w-full border-0"
          style={{ height: "calc(100vh - var(--header-height))" }}
          title="Home Content"
        />
      );
    }
    return (
      <div
        className="mt-0 prose prose-neutral dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: homePageContent }}
      />
    );
  }

  // ── Default hero home page ──
  return (
    <div className="w-full overflow-x-hidden">
      {/* ══════════════════════════════════════════
          HERO SECTION
      ══════════════════════════════════════════ */}
      <section className="relative min-h-[calc(100vh-var(--header-height))] flex items-center justify-center overflow-hidden border-b">
        {/* Background layers */}
        <div
          className="absolute inset-0 -z-10 grid-bg opacity-60"
          aria-hidden="true"
        />
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          {/* Primary glow */}
          <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[100px]" />
          {/* Gold accent glow */}
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-gold/6 blur-[80px]" />
          {/* Beam accent — top */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, oklch(from var(--primary) l c h / 0.3) 50%, transparent 100%)",
            }}
          />
        </div>

        <div className="container max-w-4xl mx-auto px-4 py-20 flex flex-col items-center text-center gap-8">
          {/* GitHub badge */}
          <motion.div {...fadeUp(0.1)}>
            {isDemoSite && status?.version && (
              <a
                href="https://github.com/nbility/nbility"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border bg-card/80 backdrop-blur-sm px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer">
                <Github className="size-4" />
                <span>{status.version}</span>
                <ChevronRight className="size-3 opacity-60" />
              </a>
            )}
          </motion.div>

          {/* Headline */}
          <motion.div {...fadeUp(0.15)} className="space-y-3">
            <h1
              className={`text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight ${isChinese ? "tracking-wider" : ""}`}>
              {t("统一的")}
              <br />
              <span className="text-gradient">{t("大模型接口网关")}</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              {t("更好的价格，更好的稳定性，只需要将模型基址替换为：")}
            </p>
          </motion.div>

          {/* API address pill */}
          <motion.div {...fadeUp(0.25)} className="w-full max-w-lg">
            <div className="flex items-center rounded-full border bg-card/90 backdrop-blur-sm shadow-card overflow-hidden">
              <div className="flex-1 px-4 py-2.5 text-sm font-mono truncate text-muted-foreground">
                {serverAddress}
              </div>
              <div className="flex items-center border-l pr-1">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={endpointIndex}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="px-3 text-sm font-mono text-primary">
                    {API_ENDPOINTS[endpointIndex]}
                  </motion.span>
                </AnimatePresence>
                <Button
                  size="icon"
                  className="rounded-full size-8 shrink-0 mr-0.5 cursor-pointer"
                  onClick={handleCopy}
                  title={t("复制")}>
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>

          {/* CTAs */}
          <motion.div
            {...fadeUp(0.32)}
            className="flex gap-3 flex-wrap justify-center">
            <Link href="/console">
              <Button
                size="lg"
                className="rounded-full px-8 shadow-primary cursor-pointer">
                <Play className="size-4 mr-2" />
                {t("获取密钥")}
              </Button>
            </Link>
            {docsLink && !isDemoSite && (
              <a href={docsLink} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full px-8 cursor-pointer">
                  <FileText className="size-4 mr-2" />
                  {t("文档")}
                </Button>
              </a>
            )}
          </motion.div>

          {/* Trust signals — inline checks */}
          <motion.div
            {...fadeUp(0.38)}
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {[
              t("免费试用"),
              t("无需信用卡"),
              t("随时取消"),
              t("OpenAI 兼容"),
            ].map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-success shrink-0" />
                {item}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          STATS BAR
      ══════════════════════════════════════════ */}
      <section className="border-b bg-card/60 backdrop-blur-sm">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-40px" }}
            variants={stagger}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {STATS.map(({ icon: Icon, value, label }) => (
              <motion.div
                key={label}
                variants={cardItem}
                className="flex flex-col items-center gap-1.5 py-3">
                <Icon className="size-5 text-primary mb-0.5" />
                <span className="text-2xl font-bold text-foreground tabular-nums stat-number">
                  {value}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(label)}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          PROVIDER LOGOS
      ══════════════════════════════════════════ */}
      <section className="py-16 border-b">
        <div className="container max-w-5xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-center mb-8">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
              {t("支持众多的大模型供应商")}
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-40px" }}
            variants={stagger}
            className="flex flex-wrap items-center justify-center gap-3">
            {PROVIDER_LOGOS.map((provider) => (
              <motion.div
                key={provider.name}
                variants={cardItem}
                className="provider-pill">
                {/* Letter avatar with brand color */}
                <span
                  className="size-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: provider.color }}
                  aria-hidden="true">
                  {provider.abbr.slice(0, 1)}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {provider.name}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FEATURES GRID
      ══════════════════════════════════════════ */}
      <section className="py-20 border-b">
        <div className="container max-w-5xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-center mb-12 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
              {t("核心能力")}
            </p>
            <h2
              className={`text-2xl sm:text-3xl font-bold ${isChinese ? "tracking-wide" : ""}`}>
              {t("企业级 AI 接入基础设施")}
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              {t("从个人开发者到大型团队，一套系统满足所有 AI 接入需求。")}
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc, iconColor, iconBg }) => (
              <motion.div
                key={title}
                variants={cardItem}
                className="feature-card group">
                <div
                  className={`size-10 rounded-xl flex items-center justify-center mb-4 ${iconBg} transition-transform duration-200 group-hover:scale-110`}>
                  <Icon className={`size-5 ${iconColor}`} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  {t(title)}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(desc)}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          API CODE PREVIEW
      ══════════════════════════════════════════ */}
      <section className="py-20 border-b">
        <div className="container max-w-4xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-center mb-10 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
              {t("零改造迁移")}
            </p>
            <h2
              className={`text-2xl sm:text-3xl font-bold ${isChinese ? "tracking-wide" : ""}`}>
              {t("只需修改一行代码")}
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              {t("完全兼容 OpenAI SDK，无需修改业务代码，只需替换 base_url。")}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.1 }}>
            {/* Tab switcher */}
            <div className="flex gap-1 mb-0 bg-muted rounded-t-xl border border-b-0 border-border/60 p-1 w-fit">
              {(
                [
                  ["after", t("接入网关")],
                  ["before", t("原始代码")],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setCodeTab(tab)}
                  className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors cursor-pointer ${
                    codeTab === tab
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Code block */}
            <div className="code-terminal">
              {/* Terminal header bar */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.06]">
                <span
                  className="size-3 rounded-full bg-destructive/70"
                  aria-hidden="true"
                />
                <span
                  className="size-3 rounded-full bg-warning/70"
                  aria-hidden="true"
                />
                <span
                  className="size-3 rounded-full bg-success/70"
                  aria-hidden="true"
                />
                <span className="ml-2 text-xs text-white/30 font-mono">
                  python
                </span>
                {codeTab === "after" && (
                  <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/20 text-success">
                    {t("推荐")}
                  </span>
                )}
              </div>

              {/* Code content */}
              <AnimatePresence mode="wait">
                <motion.pre
                  key={codeTab}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="p-5 text-sm font-mono leading-relaxed overflow-x-auto"
                  aria-label={
                    codeTab === "after"
                      ? t("接入网关代码示例")
                      : t("原始代码示例")
                  }>
                  {/* Translatable comment line */}
                  <span className="text-white/35 block mb-1 select-none">
                    {"# "}
                    {codeTab === "after"
                      ? t("切换到本网关，仅修改 base_url")
                      : t("原始 OpenAI SDK 调用")}
                  </span>
                  <code className="text-slate-200 whitespace-pre">
                    {codeTab === "after"
                      ? CODE_AFTER.replace("YOUR_GATEWAY_URL", serverAddress)
                      : CODE_BEFORE}
                  </code>
                </motion.pre>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════ */}
      <section className="py-20">
        <div className="container max-w-3xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="relative rounded-2xl border border-primary/20 overflow-hidden text-center px-8 py-14">
            {/* Background */}
            <div
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(ellipse 80% 60% at 50% 50%, oklch(from var(--primary) l c h / 0.08) 0%, transparent 70%)",
              }}
              aria-hidden="true"
            />
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, oklch(from var(--primary) l c h / 0.5), transparent)",
              }}
              aria-hidden="true"
            />

            <h2
              className={`text-2xl sm:text-3xl font-bold mb-4 ${isChinese ? "tracking-wide" : ""}`}>
              {t("立即开始使用")}
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              {t("注册账号，获取专属 API 密钥，分钟级接入所有主流 AI 供应商。")}
            </p>

            <div className="flex gap-3 justify-center flex-wrap">
              <Link href="/console">
                <Button
                  size="lg"
                  className="rounded-full px-10 shadow-primary cursor-pointer">
                  {t("免费开始")}
                  <ArrowRight className="size-4 ml-2" />
                </Button>
              </Link>
              {docsLink && (
                <a href={docsLink} target="_blank" rel="noopener noreferrer">
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-full px-8 cursor-pointer">
                    <FileText className="size-4 mr-2" />
                    {t("查看文档")}
                  </Button>
                </a>
              )}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
