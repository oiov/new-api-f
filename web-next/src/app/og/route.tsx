import { ImageResponse } from 'next/og';
import { type NextRequest } from 'next/server';

export const runtime = 'edge';

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'FishXCode';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.fishxcode.com';

// Fetch and cache the Google Noto Sans SC font subset for CJK rendering
// Cached at the edge so only fetched once per cold start
let fontCache: ArrayBuffer | null = null;

async function getCJKFont(): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  try {
    // Google Fonts CSS endpoint for Noto Sans SC — subset to common CJK
    const cssUrl =
      'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@700&display=swap';
    const css = await fetch(cssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then((r) => r.text());

    // Extract the first woff2/woff src url from the CSS
    const match = css.match(/src:\s*url\(([^)]+)\)/);
    if (!match) return null;

    fontCache = await fetch(match[1]).then((r) => r.arrayBuffer());
    return fontCache;
  } catch {
    return null;
  }
}

const PROVIDERS = ['OpenAI', 'Claude', 'Gemini', 'DeepSeek', 'Qwen', 'Mistral'];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title') || siteName;
  const description =
    searchParams.get('description') || '统一 AI API 网关 · 聚合 40+ 主流模型';

  const font = await getCJKFont();

  const options: ConstructorParameters<typeof ImageResponse>[1] = {
    width: 1200,
    height: 630,
  };
  if (font) {
    options.fonts = [
      { name: 'NotoSansSC', data: font, style: 'normal', weight: 700 },
    ];
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '64px 80px',
          background:
            'linear-gradient(135deg, #0d1117 0%, #161b22 55%, #0d1117 100%)',
          fontFamily: font ? 'NotoSansSC, sans-serif' : 'sans-serif',
        }}
      >
        {/* Decorative blobs */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -60,
            width: 420,
            height: 420,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            left: 60,
            width: 360,
            height: 360,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Brand row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              style={{ color: '#fff', fontSize: 26, fontWeight: 700 }}
            >
              {siteName.slice(0, 1).toUpperCase()}
            </span>
          </div>
          <span style={{ color: '#8b949e', fontSize: 22, fontWeight: 600 }}>
            {siteName}
          </span>
        </div>

        {/* Main title */}
        <div
          style={{
            fontSize: title === siteName ? 68 : 54,
            fontWeight: 800,
            color: '#f0f6fc',
            lineHeight: 1.1,
            marginBottom: 24,
            maxWidth: 880,
          }}
        >
          {title}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 26,
            color: '#8b949e',
            maxWidth: 780,
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: 80,
            right: 80,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: 10 }}>
            {PROVIDERS.map((name) => (
              <span
                key={name}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '4px 12px',
                  color: '#8b949e',
                  fontSize: 14,
                }}
              >
                {name}
              </span>
            ))}
            <span style={{ color: '#484f58', fontSize: 14, alignSelf: 'center' }}>
              +40
            </span>
          </div>
          <span style={{ color: '#484f58', fontSize: 16 }}>
            {siteUrl.replace(/^https?:\/\//, '')}
          </span>
        </div>
      </div>
    ),
    options,
  );
}
