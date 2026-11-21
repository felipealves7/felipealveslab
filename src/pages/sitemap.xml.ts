// /sitemap.xml, built with the site: the fixed pages plus every Lab exhibit in the content collection.
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { SITE_PAGES, sitemapXml } from '../lib/site-pages.mjs';

export const GET: APIRoute = async ({ site }) => {
  const exhibits = (await getCollection('lab')).map((entry) => `/lab/${entry.id}`).sort();
  return new Response(sitemapXml(site ?? 'https://felipealveslab.com', [...SITE_PAGES, ...exhibits]), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
