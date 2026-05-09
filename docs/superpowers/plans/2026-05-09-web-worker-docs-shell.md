# Web-Worker Docs Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `web-worker` `/docs` into a three-column documentation shell with template-style Markdown parsing, stronger reading layout, and an auto-generated desktop table of contents.

**Architecture:** Keep the existing TanStack Router docs routes, `DOC_SECTIONS`, docs search, and Markdown source files. Extend pure markup helpers first, then refactor `DocContent` to parse rendered Markdown HTML into React nodes, then replace the docs route shell with a dedicated docs layout that owns the left navigation and mobile drawer.

**Tech Stack:** React 19, TanStack Router, TypeScript, unified/remark/rehype, `html-react-parser`, Tailwind CSS v4, Base UI components, `node:test` with `bunx tsx --test`.

---

## Repository Notes

`web-worker` is an independent git repository inside the root repository:

```bash
git -C web-worker rev-parse --show-toplevel
# /Users/songjunxi/Desktop/repos/fish-new-api/web-worker
```

At plan-writing time it already had unrelated local changes:

```text
 M src/components/shared/maintenance-dialog.tsx
?? public/e3af7894-c025-456c-b421-0c88bb3bdfb7.png
```

Do not edit, stage, revert, or commit those unrelated files. Run all implementation git commands with `git -C web-worker ...` and stage only the files named in each task.

## File Structure

- Modify `web-worker/src/lib/docs-markup.ts`: pure HTML-markup helpers for splitting the first `h1` and extracting `h2`/`h3` table-of-contents records.
- Modify `web-worker/src/lib/docs-markup.test.ts`: focused tests for `extractDocHeadings` and existing `splitAfterFirstH1`.
- Modify `web-worker/src/components/docs/doc-content.tsx`: template-style Markdown HTML parsing, copy button, heading TOC rendering, error/loading states.
- Modify `web-worker/src/components/docs/docs-layout.tsx`: dedicated docs shell with fixed left sidebar, brand/search/nav/footer controls, mobile header and drawer.
- Modify `web-worker/src/routes/docs.tsx`: remove the global marketing `Navbar` from `/docs`; let `DocsLayout` own the docs page shell.
- Modify `web-worker/src/i18n/locales/zh/docs.json`: add TOC and render-failure strings.
- Modify `web-worker/src/i18n/locales/en/docs.json`: add TOC and render-failure strings.
- Modify `web-worker/src/custom.css`: docs prose polish for headings, tables, images, code blocks, and autolink anchors.

---

### Task 1: Add Failing Tests For Docs Heading Extraction

**Files:**
- Modify: `web-worker/src/lib/docs-markup.test.ts`
- Test: `web-worker/src/lib/docs-markup.test.ts`

- [ ] **Step 1: Replace the test file with coverage for TOC extraction**

Replace `web-worker/src/lib/docs-markup.test.ts` with:

```ts
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { extractDocHeadings, splitAfterFirstH1 } from './docs-markup';

describe('splitAfterFirstH1', () => {
  test('splits rendered markdown after the first h1', () => {
    const result = splitAfterFirstH1('<h1>Title</h1><p>Body</p>');

    assert.deepEqual(result, {
      before: '<h1>Title</h1>',
      after: '<p>Body</p>',
      hasH1: true,
    });
  });

  test('falls back when no h1 exists', () => {
    const result = splitAfterFirstH1('<p>Body</p>');

    assert.deepEqual(result, {
      before: '',
      after: '<p>Body</p>',
      hasH1: false,
    });
  });
});

describe('extractDocHeadings', () => {
  test('extracts h2 and h3 headings in document order', () => {
    const result = extractDocHeadings(`
      <h1 id="intro"><a class="anchor" href="#intro">Intro</a></h1>
      <h2 id="auth"><a class="anchor" href="#auth">Authentication</a></h2>
      <p>Body</p>
      <h3 id="bearer-token"><a class="anchor" href="#bearer-token">Bearer Token</a></h3>
      <h2 id="models">Models</h2>
    `);

    assert.deepEqual(result, [
      { id: 'auth', text: 'Authentication', depth: 2 },
      { id: 'bearer-token', text: 'Bearer Token', depth: 3 },
      { id: 'models', text: 'Models', depth: 2 },
    ]);
  });

  test('cleans inline tags and html entities from heading text', () => {
    const result = extractDocHeadings(
      '<h2 id="request-body"><a class="anchor" href="#request-body">Request <code>body</code> &amp; fields</a></h2>',
    );

    assert.deepEqual(result, [
      { id: 'request-body', text: 'Request body & fields', depth: 2 },
    ]);
  });

  test('ignores headings without ids or readable text', () => {
    const result = extractDocHeadings(`
      <h2>No id</h2>
      <h3 id="">Empty id</h3>
      <h3 id="blank"><a class="anchor" href="#blank"><span> </span></a></h3>
      <h4 id="not-in-toc">Not included</h4>
      <h2 id="valid">Valid</h2>
    `);

    assert.deepEqual(result, [{ id: 'valid', text: 'Valid', depth: 2 }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd web-worker
bunx tsx --test src/lib/docs-markup.test.ts
```

Expected: FAIL because `extractDocHeadings` is not exported from `src/lib/docs-markup.ts`.

- [ ] **Step 3: Commit the failing test**

Run:

```bash
git -C web-worker add src/lib/docs-markup.test.ts
git -C web-worker commit -m "test: cover docs heading extraction"
```

Expected: one commit containing only `src/lib/docs-markup.test.ts`.

---

### Task 2: Implement Pure Docs Markup Helpers

**Files:**
- Modify: `web-worker/src/lib/docs-markup.ts`
- Test: `web-worker/src/lib/docs-markup.test.ts`

- [ ] **Step 1: Replace `docs-markup.ts` with the helper implementation**

Replace `web-worker/src/lib/docs-markup.ts` with:

```ts
export type SplitDocMarkup = {
  before: string;
  after: string;
  hasH1: boolean;
};

export type DocHeading = {
  id: string;
  text: string;
  depth: 2 | 3;
};

const htmlEntityMap: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

export function splitAfterFirstH1(markup: string): SplitDocMarkup {
  const h1Match = markup.match(/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/i);

  if (!h1Match?.[0] || h1Match.index === undefined) {
    return {
      before: '',
      after: markup,
      hasH1: false,
    };
  }

  const splitIndex = h1Match.index + h1Match[0].length;

  return {
    before: markup.slice(0, splitIndex),
    after: markup.slice(splitIndex),
    hasH1: true,
  };
}

export function extractDocHeadings(markup: string): DocHeading[] {
  const headings: DocHeading[] = [];
  const headingPattern = /<h([23])\s+([^>]*)>([\s\S]*?)<\/h\1>/gi;

  for (const match of markup.matchAll(headingPattern)) {
    const depth = Number(match[1]) as 2 | 3;
    const attributes = match[2] ?? '';
    const body = match[3] ?? '';
    const id = extractAttribute(attributes, 'id');
    const text = normalizeHeadingText(body);

    if (!id || !text) {
      continue;
    }

    headings.push({ id, text, depth });
  }

  return headings;
}

function extractAttribute(attributes: string, name: string): string {
  const pattern = new RegExp(
    `(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const match = attributes.match(pattern);
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function normalizeHeadingText(markup: string): string {
  return decodeHtmlEntities(markup.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, raw) => {
    const key = String(raw).toLowerCase();

    if (key.startsWith('#x')) {
      return decodeCodePoint(Number.parseInt(key.slice(2), 16), entity);
    }

    if (key.startsWith('#')) {
      return decodeCodePoint(Number.parseInt(key.slice(1), 10), entity);
    }

    return htmlEntityMap[key] ?? entity;
  });
}

function decodeCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isFinite(codePoint)) {
    return fallback;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
cd web-worker
bunx tsx --test src/lib/docs-markup.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit the helper implementation**

Run:

```bash
git -C web-worker add src/lib/docs-markup.ts src/lib/docs-markup.test.ts
git -C web-worker commit -m "feat: extract docs table of contents headings"
```

Expected: one commit containing only `src/lib/docs-markup.ts` and `src/lib/docs-markup.test.ts`.

---

### Task 3: Restore Template-Style Markdown Parsing In `DocContent`

**Files:**
- Modify: `web-worker/src/components/docs/doc-content.tsx`
- Modify: `web-worker/src/i18n/locales/zh/docs.json`
- Modify: `web-worker/src/i18n/locales/en/docs.json`
- Test: `web-worker/src/lib/docs-markup.test.ts`

- [ ] **Step 1: Add docs UI strings**

In `web-worker/src/i18n/locales/zh/docs.json`, add these top-level sections after the existing `"copy"` section:

```json
  },
  "tableOfContents": {
    "title": "目录"
  },
  "render": {
    "failed": "文档渲染失败，请稍后重试"
  }
}
```

The end of the file should become:

```json
  "copy": {
    "markdown": "复制 Markdown",
    "success": "已复制 Markdown",
    "failed": "复制失败，请手动复制"
  },
  "tableOfContents": {
    "title": "目录"
  },
  "render": {
    "failed": "文档渲染失败，请稍后重试"
  }
}
```

In `web-worker/src/i18n/locales/en/docs.json`, add the matching English strings:

```json
  "copy": {
    "markdown": "Copy Markdown",
    "success": "Markdown copied",
    "failed": "Copy failed. Please copy manually."
  },
  "tableOfContents": {
    "title": "Table of Contents"
  },
  "render": {
    "failed": "Unable to render this document. Please try again later."
  }
}
```

- [ ] **Step 2: Replace `DocContent` with React parser rendering and TOC**

Replace `web-worker/src/components/docs/doc-content.tsx` with:

```tsx
import parse, {
  type DOMNode,
  type HTMLReactParserOptions,
  domToReact,
  Element,
} from 'html-react-parser';
import { Link } from '@tanstack/react-router';
import { IconCheck, IconCopy, IconListDetails } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
  extractDocHeadings,
  splitAfterFirstH1,
  type DocHeading,
} from '@/lib/docs-markup';
import { renderMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';

type ReactAttribs = Record<string, string | undefined>;

export function DocContent({ source }: { source: string }) {
  const { t } = useTranslation('docs');
  const [html, setHtml] = useState('');
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setHtml('');
    setFailed(false);

    renderMarkdown(source)
      .then((result) => {
        if (active) {
          setHtml(result.markup);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [source]);

  const parserOptions = useMemo(() => createParserOptions(), []);
  const splitMarkup = useMemo(() => splitAfterFirstH1(html), [html]);
  const headings = useMemo(() => extractDocHeadings(html), [html]);

  async function handleCopyMarkdown() {
    try {
      await copyTextToClipboard(source);
      setCopied(true);
      toast.success(t('copy.success'));
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('copy.failed'));
    }
  }

  const copyButton = (
    <div className="my-6 flex justify-start">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={handleCopyMarkdown}
      >
        {copied ? (
          <IconCheck className="size-4" />
        ) : (
          <IconCopy className="size-4" />
        )}
        {t('copy.markdown')}
      </Button>
    </div>
  );

  if (failed) {
    return (
      <div className="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 max-w-3xl">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t('render.failed')}
          </div>
          {copyButton}
        </div>
      </div>
    );
  }

  if (!html) {
    return (
      <div className="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 max-w-3xl animate-pulse space-y-5">
          <div className="h-10 w-2/3 rounded bg-muted" />
          <div className="h-5 w-full rounded bg-muted" />
          <div className="h-5 w-5/6 rounded bg-muted" />
          <div className="h-9 w-36 rounded bg-muted" />
          <div className="h-px w-full bg-border" />
          <div className="h-6 w-1/2 rounded bg-muted" />
          <div className="h-32 w-full rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0 max-w-3xl">
        {splitMarkup.hasH1 ? (
          <article className="docs-prose prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20">
            {parse(splitMarkup.before, parserOptions)}
          </article>
        ) : null}

        {copyButton}

        <div className="mb-8 border-t border-border" />

        <article className="docs-prose prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20">
          {parse(splitMarkup.after, parserOptions)}
        </article>
      </div>

      <DocTableOfContents headings={headings} />
    </div>
  );
}

function DocTableOfContents({ headings }: { headings: DocHeading[] }) {
  const { t } = useTranslation('docs');

  if (headings.length === 0) {
    return null;
  }

  return (
    <aside className="hidden min-w-0 xl:block">
      <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto border-l border-border pl-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <IconListDetails className="size-4" />
          {t('tableOfContents.title')}
        </div>
        <nav className="space-y-1">
          {headings.map((heading) => (
            <a
              key={`${heading.depth}-${heading.id}`}
              href={`#${heading.id}`}
              className={cn(
                'block rounded-md py-1.5 text-sm leading-5 text-muted-foreground transition hover:text-foreground',
                heading.depth === 3 ? 'pl-4' : 'pl-0 font-medium',
              )}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function createParserOptions(): HTMLReactParserOptions {
  const parserOptions: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (!(domNode instanceof Element)) {
        return;
      }

      if (domNode.name === 'a') {
        const href = domNode.attribs.href;
        const children = domToReact(domNode.children as DOMNode[], parserOptions);

        if (href && isInternalHref(href)) {
          return (
            <Link
              to={href}
              className={cn(
                'font-medium underline underline-offset-4',
                domNode.attribs.class,
              )}
            >
              {children}
            </Link>
          );
        }

        const linkAttribs = mapReactAttribs(domNode.attribs);
        return (
          <a
            {...linkAttribs}
            href={href}
            target={href?.startsWith('http') ? '_blank' : linkAttribs.target}
            rel={
              href?.startsWith('http')
                ? 'noreferrer noopener'
                : linkAttribs.rel
            }
          >
            {children}
          </a>
        );
      }

      if (domNode.name === 'img') {
        return (
          <img
            src={domNode.attribs.src}
            alt={domNode.attribs.alt ?? ''}
            title={domNode.attribs.title}
            width={domNode.attribs.width}
            height={domNode.attribs.height}
            loading="lazy"
            className={cn(
              'rounded-lg border border-border shadow-sm',
              domNode.attribs.class,
            )}
          />
        );
      }

      if (domNode.name === 'code') {
        const codeAttribs = mapReactAttribs(domNode.attribs);
        return (
          <code {...codeAttribs}>
            {domToReact(domNode.children as DOMNode[], parserOptions)}
          </code>
        );
      }
    },
  };

  return parserOptions;
}

function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

function mapReactAttribs(attribs: Record<string, string>): ReactAttribs {
  const { class: className, ...rest } = attribs;
  const reactAttribs: ReactAttribs = {};

  for (const [key, value] of Object.entries(rest)) {
    if (key !== 'style') {
      reactAttribs[key] = value;
    }
  }

  if (className) {
    reactAttribs.className = className;
  }

  return reactAttribs;
}
```

- [ ] **Step 3: Run the focused helper test**

Run:

```bash
cd web-worker
bunx tsx --test src/lib/docs-markup.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit parser rendering and strings**

Run:

```bash
git -C web-worker add src/components/docs/doc-content.tsx src/i18n/locales/zh/docs.json src/i18n/locales/en/docs.json
git -C web-worker commit -m "feat: render docs markdown with react parser"
```

Expected: one commit containing only `DocContent` and the two docs locale files.

---

### Task 4: Replace The `/docs` Route With A Dedicated Docs Shell

**Files:**
- Modify: `web-worker/src/components/docs/docs-layout.tsx`
- Modify: `web-worker/src/routes/docs.tsx`

- [ ] **Step 1: Remove the marketing navbar from the docs route**

Replace `web-worker/src/routes/docs.tsx` with:

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { DocsLayout } from '@/components/docs/docs-layout';

export const Route = createFileRoute('/docs')({
  component: DocsShell,
});

function DocsShell() {
  return <DocsLayout><Outlet /></DocsLayout>;
}
```

After formatting, if Biome expands the return expression, this equivalent form is also acceptable:

```tsx
function DocsShell() {
  return (
    <DocsLayout>
      <Outlet />
    </DocsLayout>
  );
}
```

- [ ] **Step 2: Replace `DocsLayout` with the dedicated shell**

Replace `web-worker/src/components/docs/docs-layout.tsx` with:

```tsx
import { Link, useRouterState } from '@tanstack/react-router';
import {
  IconChevronRight,
  IconFileText,
  IconHome,
  IconMenu2,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DocsSearch } from '@/components/docs/docs-search';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Logo } from '@/components/shared/logo';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DOC_SECTIONS, type DocsNavLinkItem } from '@/lib/docs-registry';
import { cn } from '@/lib/utils';

function normalizePathname(pathname: string) {
  return pathname.replace(/\/$/, '') || '/docs';
}

function DocsNavLink({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={href}
      onClick={onNavigate}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
        active
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
      )}
    >
      <IconFileText className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function DocsNavGroup({
  title,
  links,
  normalized,
  onNavigate,
}: {
  title: string;
  links: DocsNavLinkItem[];
  normalized: string;
  onNavigate?: () => void;
}) {
  const hasActiveLink = links.some(
    (link) => normalizePathname(link.href) === normalized,
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasActiveLink) {
      setOpen(true);
    }
  }, [hasActiveLink]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className={cn(
              'h-9 w-full justify-between rounded-lg px-3 text-left text-sm font-medium text-foreground hover:bg-muted',
              hasActiveLink && 'bg-muted/60',
            )}
          >
            <span className="truncate">{title}</span>
            <IconChevronRight
              className={cn('size-4 transition-transform', open && 'rotate-90')}
            />
          </Button>
        }
        nativeButton={false}
      />
      <CollapsibleContent className="space-y-1 pt-1 pl-2">
        {links.map((link) => (
          <DocsNavLink
            key={link.href}
            href={link.href}
            label={link.labelKey}
            active={normalizePathname(link.href) === normalized}
            onNavigate={onNavigate}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function DocsNav({
  normalized,
  onNavigate,
}: {
  normalized: string;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation('docs');

  return (
    <nav className="space-y-6">
      {DOC_SECTIONS.map((section) => (
        <div key={section.id} className="space-y-2">
          <p className="px-3 text-[11px] font-semibold tracking-wider text-muted-foreground">
            {t(`nav.${section.titleKey}`)}
          </p>
          <div className="space-y-1">
            {section.groups.map((group) => (
              <DocsNavGroup
                key={group.id}
                title={t(`nav.${group.titleKey}`)}
                normalized={normalized}
                onNavigate={onNavigate}
                links={group.links.map((link) => ({
                  ...link,
                  labelKey: t(`nav.${link.labelKey}`),
                }))}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function DocsBrand() {
  return (
    <Link
      to="/docs"
      className="flex min-w-0 items-center gap-3 text-base font-semibold text-foreground"
    >
      <Logo className="size-8 shrink-0" />
      <span className="truncate">Nbility Docs</span>
    </Link>
  );
}

export function DocsLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation('docs');
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const normalized = normalizePathname(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [normalized]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden h-screen w-72 shrink-0 flex-col border-r border-border bg-card/35 lg:flex">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
          <DocsBrand />
          <Link
            to="/"
            aria-label="Homepage"
            className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <IconHome className="size-4" />
          </Link>
        </div>

        <div className="shrink-0 border-b border-border p-4">
          <DocsSearch />
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-3 py-5">
            <DocsNav normalized={normalized} />
          </div>
        </ScrollArea>

        <div className="flex shrink-0 items-center gap-1 border-t border-border p-3">
          <LanguageSwitcher buttonClassName="text-muted-foreground hover:text-foreground hover:bg-muted" />
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <DocsBrand />
          <div className="flex items-center gap-2">
            <DocsSearch compact enableShortcut={false} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-label={t('nav.mobileMenu')}
            >
              <IconMenu2 className="size-4" />
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
          {children}
        </main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[88vw] max-w-sm overflow-y-auto px-0"
        >
          <SheetHeader className="px-4 pb-2 text-left">
            <SheetTitle>{t('nav.mobileTitle')}</SheetTitle>
            <SheetDescription>{t('nav.mobileDescription')}</SheetDescription>
          </SheetHeader>
          <div className="border-y border-border px-4 py-4">
            <DocsSearch enableShortcut={false} />
          </div>
          <div className="px-3 py-5">
            <DocsNav
              normalized={normalized}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
          <div className="flex items-center gap-1 border-t border-border p-3">
            <LanguageSwitcher buttonClassName="text-muted-foreground hover:text-foreground hover:bg-muted" />
            <ThemeToggle />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 3: Run the focused helper test**

Run:

```bash
cd web-worker
bunx tsx --test src/lib/docs-markup.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the docs shell layout**

Run:

```bash
git -C web-worker add src/components/docs/docs-layout.tsx src/routes/docs.tsx
git -C web-worker commit -m "feat: add dedicated docs shell layout"
```

Expected: one commit containing only `src/components/docs/docs-layout.tsx` and `src/routes/docs.tsx`.

---

### Task 5: Polish Docs Prose Styling

**Files:**
- Modify: `web-worker/src/custom.css`

- [ ] **Step 1: Replace the custom markdown CSS block**

In `web-worker/src/custom.css`, replace the current block from `/* custom markdown styles start */` through `/* custom markdown styles end */` with:

```css
/* custom markdown styles start */

.docs-prose {
  overflow-wrap: anywhere;
}

.docs-prose :where(h1) {
  margin-bottom: 1rem;
  font-size: clamp(2.25rem, 5vw, 3.75rem);
  line-height: 1.05;
  letter-spacing: 0;
}

.docs-prose :where(h2) {
  border-top: 1px solid var(--border);
  padding-top: 2rem;
}

.docs-prose :where(h2:first-child) {
  border-top: 0;
  padding-top: 0;
}

.docs-prose :where(a) {
  text-underline-offset: 4px;
}

.docs-prose :where(img) {
  margin-inline: auto;
}

.docs-prose :where(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  white-space: nowrap;
}

.docs-prose :where(th, td) {
  border: 1px solid var(--border);
  padding: 0.625rem 0.75rem;
  vertical-align: top;
}

.docs-prose :where(th) {
  background: color-mix(in oklab, var(--muted) 72%, transparent);
  font-size: 0.75rem;
  font-weight: 650;
  letter-spacing: 0;
  text-align: left;
}

.docs-prose :where(pre) {
  overflow-x: auto;
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  border-radius: 0.75rem;
  background: #0b1020;
  color: #e5eef9;
}

.dark .docs-prose :where(pre) {
  background: #0b1020;
}

.docs-prose :where(pre code.hljs) {
  display: block;
  overflow-x: auto;
  background: transparent;
  padding: 1rem 1.25rem;
  color: #e5eef9;
}

.docs-prose :where(pre code:not(.hljs)) {
  display: block;
  padding: 1rem 1.25rem;
}

.docs-prose :where(code:not(pre code)) {
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  border-radius: 0.375rem;
  background: color-mix(in oklab, var(--muted) 72%, transparent);
  padding: 0.1rem 0.35rem;
  color: var(--foreground);
  font-weight: 500;
}

.docs-prose .hljs-comment,
.docs-prose .hljs-quote {
  color: #8b9bb3;
  font-style: italic;
}

.docs-prose .hljs-keyword,
.docs-prose .hljs-selector-tag,
.docs-prose .hljs-literal,
.docs-prose .hljs-type {
  color: #ff7ab6;
}

.docs-prose .hljs-string,
.docs-prose .hljs-regexp,
.docs-prose .hljs-meta .hljs-string {
  color: #9ee493;
}

.docs-prose .hljs-number,
.docs-prose .hljs-symbol,
.docs-prose .hljs-bullet {
  color: #ffb86c;
}

.docs-prose .hljs-title,
.docs-prose .hljs-title.function_,
.docs-prose .hljs-function .hljs-title,
.docs-prose .hljs-section {
  color: #82aaff;
}

.docs-prose .hljs-attr,
.docs-prose .hljs-attribute,
.docs-prose .hljs-variable,
.docs-prose .hljs-template-variable,
.docs-prose .hljs-property {
  color: #7fdbff;
}

.docs-prose .hljs-built_in,
.docs-prose .hljs-class .hljs-title,
.docs-prose .hljs-params {
  color: #ffd580;
}

.docs-prose .hljs-meta,
.docs-prose .hljs-doctag {
  color: #c099ff;
}

.docs-prose :where(h1 a, h2 a, h3 a, h4 a, h5 a, h6 a),
.docs-prose :where(h1 a:hover, h2 a:hover, h3 a:hover, h4 a:hover, h5 a:hover, h6 a:hover) {
  color: inherit;
  text-decoration: none;
}

/* custom markdown styles end */
```

- [ ] **Step 2: Run the focused helper test**

Run:

```bash
cd web-worker
bunx tsx --test src/lib/docs-markup.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit docs prose CSS**

Run:

```bash
git -C web-worker add src/custom.css
git -C web-worker commit -m "style: polish docs markdown presentation"
```

Expected: one commit containing only `src/custom.css`.

---

### Task 6: Run Full Verification And Fix Type/Build Issues

**Files:**
- Modify only files already touched by Tasks 1-5 if verification exposes issues.

- [ ] **Step 1: Run the focused unit test**

Run:

```bash
cd web-worker
bunx tsx --test src/lib/docs-markup.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript/build verification**

Run:

```bash
cd web-worker
pnpm build
```

Expected: PASS. If this fails with a type error in files changed by this plan, fix that exact file and rerun `pnpm build`.

- [ ] **Step 3: Run targeted Biome check**

Run:

```bash
cd web-worker
pnpm exec biome check src/components/docs/doc-content.tsx src/components/docs/docs-layout.tsx src/lib/docs-markup.ts src/lib/docs-markup.test.ts src/custom.css src/routes/docs.tsx src/i18n/locales/zh/docs.json src/i18n/locales/en/docs.json
```

Expected: PASS. If Biome reports formatting-only changes, run:

```bash
cd web-worker
pnpm exec biome check --write src/components/docs/doc-content.tsx src/components/docs/docs-layout.tsx src/lib/docs-markup.ts src/lib/docs-markup.test.ts src/custom.css src/routes/docs.tsx src/i18n/locales/zh/docs.json src/i18n/locales/en/docs.json
```

Then rerun the non-`--write` command.

- [ ] **Step 4: Run visual smoke test locally**

Start the dev server:

```bash
cd web-worker
pnpm run dev
```

Open these pages:

```text
http://localhost:3000/docs
http://localhost:3000/docs/guide
http://localhost:3000/docs/api
http://localhost:3000/docs/api/chat/completions
```

Expected:

- The marketing navbar is gone on `/docs`.
- Desktop shows left docs shell, central content, and right TOC when the page has `h2` or `h3`.
- Mobile width shows a top docs header and drawer menu, with no right TOC.
- Search opens and navigates.
- Copy Markdown still works.
- Internal `/docs/...` links navigate without a full page reload.
- Code blocks, tables, and images stay inside the content column.

- [ ] **Step 5: Commit verification fixes if any were needed**

If Step 2 or Step 3 required changes, run:

```bash
git -C web-worker add src/components/docs/doc-content.tsx src/components/docs/docs-layout.tsx src/lib/docs-markup.ts src/lib/docs-markup.test.ts src/custom.css src/routes/docs.tsx src/i18n/locales/zh/docs.json src/i18n/locales/en/docs.json
git -C web-worker commit -m "fix: resolve docs shell verification issues"
```

Expected: commit only files changed by this plan. If no fixes were needed, do not create an empty commit.

---

## Final Status Check

Run:

```bash
git -C web-worker status --short
```

Expected: only the unrelated pre-existing files remain, if they still exist:

```text
 M src/components/shared/maintenance-dialog.tsx
?? public/e3af7894-c025-456c-b421-0c88bb3bdfb7.png
```

If any plan-touched file remains modified, inspect it and either commit it as part of the docs-shell work or fix the verification issue that left it dirty.
