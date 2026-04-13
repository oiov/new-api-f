import { useEffect, useId } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = (
  import.meta.env.VITE_PUBLIC_SITE_URL || 'https://nbility.dev'
).replace(/\/$/, '');
const DEFAULT_OG_IMAGE = '/logo.png';
const DEFAULT_SITE_ICON = '/favicon.ico';
const DEFAULT_TOUCH_ICON = '/logo.png';

function getImageMeta(imageUrl) {
  const pathname = new URL(imageUrl).pathname.toLowerCase();
  if (pathname.endsWith('.png')) {
    return {
      type: 'image/png',
      width: '180',
      height: '180',
    };
  }
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return {
      type: 'image/jpeg',
    };
  }
  if (pathname.endsWith('.webp')) {
    return {
      type: 'image/webp',
    };
  }
  return {};
}

function upsertMeta(attr, key, content, ownerId) {
  if (!content) {
    return null;
  }

  let element = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attr, key);
    element.dataset.seoManaged = 'true';
    document.head.appendChild(element);
  }
  element.dataset.seoOwner = ownerId;
  element.setAttribute('content', content);
  return element;
}

function upsertLink(rel, href, ownerId) {
  if (!href) {
    return null;
  }

  let element = document.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    element.dataset.seoManaged = 'true';
    document.head.appendChild(element);
  }
  element.dataset.seoOwner = ownerId;
  element.setAttribute('href', href);
  return element;
}

function upsertItemProp(itemProp, content, ownerId) {
  if (!content) {
    return null;
  }

  let element = document.head.querySelector(`meta[itemprop="${itemProp}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('itemprop', itemProp);
    element.dataset.seoManaged = 'true';
    document.head.appendChild(element);
  }
  element.dataset.seoOwner = ownerId;
  element.setAttribute('content', content);
  return element;
}

function upsertAlternateFeedLink(href, ownerId) {
  if (!href) {
    return null;
  }

  let element = document.head.querySelector(
    'link[rel="alternate"][type="application/rss+xml"]',
  );
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'alternate');
    element.setAttribute('type', 'application/rss+xml');
    element.dataset.seoManaged = 'true';
    document.head.appendChild(element);
  }
  element.dataset.seoOwner = ownerId;
  element.setAttribute('title', 'Nbility AI RSS');
  element.setAttribute('href', href);
  return element;
}

function normalizeJsonLd(jsonLd) {
  if (!jsonLd) {
    return [];
  }
  return Array.isArray(jsonLd) ? jsonLd : [jsonLd];
}

const SeoMeta = ({
  title,
  description,
  keywords,
  canonicalPath,
  robots = 'index,follow',
  image = DEFAULT_OG_IMAGE,
  type = 'website',
  locale = 'zh_CN',
  jsonLd,
}) => {
  const location = useLocation();
  const ownerId = useId().replace(/:/g, '');

  useEffect(() => {
    if (title) {
      document.title = title;
      let titleElement = document.head.querySelector('title');
      if (!titleElement) {
        titleElement = document.createElement('title');
        document.head.appendChild(titleElement);
      }
      titleElement.textContent = title;
    }

    const path = canonicalPath || location.pathname || '/';
    const canonicalUrl = new URL(path, `${SITE_URL}/`).toString();
    const imageUrl = new URL(image, `${SITE_URL}/`).toString();
    const rssUrl = new URL('/rss.xml', `${SITE_URL}/`).toString();
    const siteIconUrl = new URL(DEFAULT_SITE_ICON, `${SITE_URL}/`).toString();
    const touchIconUrl = new URL(DEFAULT_TOUCH_ICON, `${SITE_URL}/`).toString();
    const imageMeta = getImageMeta(imageUrl);

    const touchedElements = [
      upsertMeta('name', 'description', description, ownerId),
      upsertMeta('name', 'keywords', keywords, ownerId),
      upsertMeta('name', 'robots', robots, ownerId),
      upsertMeta('property', 'og:title', title, ownerId),
      upsertMeta('property', 'og:description', description, ownerId),
      upsertMeta('property', 'og:type', type, ownerId),
      upsertMeta('property', 'og:url', canonicalUrl, ownerId),
      upsertMeta('property', 'og:site_name', 'Nbility AI', ownerId),
      upsertMeta('property', 'og:locale', locale, ownerId),
      upsertMeta('property', 'og:image', imageUrl, ownerId),
      upsertMeta('property', 'og:image:secure_url', imageUrl, ownerId),
      upsertMeta('property', 'og:image:type', imageMeta.type, ownerId),
      upsertMeta('property', 'og:image:width', imageMeta.width, ownerId),
      upsertMeta('property', 'og:image:height', imageMeta.height, ownerId),
      upsertMeta('property', 'og:image:alt', title, ownerId),
      upsertMeta('name', 'twitter:card', 'summary_large_image', ownerId),
      upsertMeta('name', 'twitter:title', title, ownerId),
      upsertMeta('name', 'twitter:description', description, ownerId),
      upsertMeta('name', 'twitter:image', imageUrl, ownerId),
      upsertItemProp('name', title, ownerId),
      upsertItemProp('description', description, ownerId),
      upsertItemProp('image', imageUrl, ownerId),
      upsertLink('canonical', canonicalUrl, ownerId),
      upsertLink('icon', siteIconUrl, ownerId),
      upsertLink('shortcut icon', siteIconUrl, ownerId),
      upsertLink('apple-touch-icon', touchIconUrl, ownerId),
      upsertAlternateFeedLink(rssUrl, ownerId),
    ].filter(Boolean);

    const scripts = normalizeJsonLd(jsonLd).map((item, index) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.seoJsonLd = `${ownerId}-${index}`;
      script.dataset.seoOwner = ownerId;
      script.text = JSON.stringify(item);
      document.head.appendChild(script);
      return script;
    });

    return () => {
      scripts.forEach((script) => {
        if (script?.dataset?.seoOwner === ownerId) {
          script.remove();
        }
      });
      touchedElements.forEach((element) => {
        if (
          element?.dataset?.seoManaged === 'true' &&
          element?.dataset?.seoOwner === ownerId
        ) {
          element.remove();
        }
      });
    };
  }, [
    canonicalPath,
    description,
    image,
    jsonLd,
    keywords,
    locale,
    location.pathname,
    ownerId,
    robots,
    title,
    type,
  ]);

  return null;
};

export default SeoMeta;
