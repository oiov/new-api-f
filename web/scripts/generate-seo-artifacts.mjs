import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildRobotsTxt,
  buildRssXml,
  buildSitemapXml,
  fetchSubscriptionPlans,
} from '../api/_utils/subscription-seo.js';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);

async function writeOutput(relativePath, content) {
  const absolutePath = resolve(projectRoot, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
  console.log(`generated ${relativePath}`);
}

async function outputExists(relativePath) {
  const absolutePath = resolve(projectRoot, relativePath);
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let plans = [];
  let fetchSucceeded = false;

  try {
    plans = await fetchSubscriptionPlans();
    fetchSucceeded = true;
  } catch (error) {
    console.warn('failed to fetch subscription plans, keeping existing seo artifacts when possible');
    console.warn(error instanceof Error ? error.message : error);
  }

  const hasExistingSitemap = await outputExists('public/sitemap.xml');
  const hasExistingRss = await outputExists('public/rss.xml');

  if (fetchSucceeded || !hasExistingSitemap) {
    await writeOutput('public/sitemap.xml', buildSitemapXml(plans));
  } else {
    console.log('kept public/sitemap.xml');
  }

  if (fetchSucceeded || !hasExistingRss) {
    await writeOutput('public/rss.xml', buildRssXml(plans));
  } else {
    console.log('kept public/rss.xml');
  }

  await writeOutput('public/robots.txt', buildRobotsTxt());
}

main().catch((error) => {
  console.error('failed to generate seo artifacts');
  console.error(error);
  process.exit(1);
});
