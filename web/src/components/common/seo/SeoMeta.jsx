import { useEffect, useId } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = (
  import.meta.env.VITE_PUBLIC_SITE_URL || 'https://nbility.dev'
).replace(/\/$/, '');
const DEFAULT_OG_IMAGE = '/cover-4.webp';

function upsertMeta(attr, key, content) {
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
  element.setAttribute('content', content);
  return element;
}

function upsertLink(rel, href) {
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
  const jsonLdId = useId().replace(/:/g, '');

  useEffect(() => {
    if (title) {
      document.title = title;
    }

    const path = canonicalPath || location.pathname || '/';
    const canonicalUrl = new URL(path, `${SITE_URL}/`).toString();
    const imageUrl = new URL(image, `${SITE_URL}/`).toString();

    const touchedElements = [
      upsertMeta('name', 'description', description),
      upsertMeta('name', 'keywords', keywords),
      upsertMeta('name', 'robots', robots),
      upsertMeta('property', 'og:title', title),
      upsertMeta('property', 'og:description', description),
      upsertMeta('property', 'og:type', type),
      upsertMeta('property', 'og:url', canonicalUrl),
      upsertMeta('property', 'og:site_name', 'NBility'),
      upsertMeta('property', 'og:locale', locale),
      upsertMeta('property', 'og:image', imageUrl),
      upsertMeta('name', 'twitter:card', 'summary_large_image'),
      upsertMeta('name', 'twitter:title', title),
      upsertMeta('name', 'twitter:description', description),
      upsertMeta('name', 'twitter:image', imageUrl),
      upsertLink('canonical', canonicalUrl),
    ].filter(Boolean);

    const scripts = normalizeJsonLd(jsonLd).map((item, index) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.seoJsonLd = `${jsonLdId}-${index}`;
      script.text = JSON.stringify(item);
      document.head.appendChild(script);
      return script;
    });

    return () => {
      scripts.forEach((script) => script.remove());
      touchedElements.forEach((element) => {
        if (element?.dataset?.seoManaged === 'true') {
          element.remove();
        }
      });
    };
  }, [
    canonicalPath,
    description,
    image,
    jsonLd,
    jsonLdId,
    keywords,
    locale,
    location.pathname,
    robots,
    title,
    type,
  ]);

  return null;
};

export default SeoMeta;
