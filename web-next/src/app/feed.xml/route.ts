import { NextResponse } from "next/server";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Nbility";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nbility.dev";
const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.nbility.dev";

interface Announcement {
  id: number;
  content: string;
  publishDate: string;
  type: string;
  extra?: string;
}

interface SystemStatus {
  announcements?: Announcement[];
  system_name?: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  let announcements: Announcement[] = [];
  let displayName = siteName;

  try {
    const res = await fetch(`${apiBaseUrl}/api/status`, {
      next: { revalidate: 300 }, // cache 5 minutes
    });
    if (res.ok) {
      const json = (await res.json()) as {
        success: boolean;
        data: SystemStatus;
      };
      if (json.success && json.data) {
        announcements = json.data.announcements || [];
        displayName = json.data.system_name || siteName;
      }
    }
  } catch {
    // ignore fetch errors — return empty feed
  }

  const now = new Date().toUTCString();

  const items = announcements
    .slice(0, 20)
    .map((a) => {
      const pubDate = a.publishDate
        ? new Date(a.publishDate).toUTCString()
        : now;
      const link = `${siteUrl}/status`;
      const title = escapeXml(
        a.content.length > 60
          ? a.content.slice(0, 60).replace(/\n/g, " ") + "…"
          : a.content.replace(/\n/g, " "),
      );
      const description = escapeXml(a.content);
      return `
    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${siteUrl}/announcements/${a.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${a.content}]]></description>
      <category>${escapeXml(a.type)}</category>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(displayName)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(displayName)} — 系统公告与服务动态</description>
    <language>zh-CN</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>300</ttl>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${siteUrl}/logo.png</url>
      <title>${escapeXml(displayName)}</title>
      <link>${siteUrl}</link>
    </image>${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
