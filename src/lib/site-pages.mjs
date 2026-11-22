// The site's fixed pages, for the sitemap. Lab exhibits are added from the content collection, so a
// new exhibit is listed when its page is merged. /404 and preview pages marked noindex stay out.
// scripts/sitemap.test.mjs checks this list against the files in src/pages.
export const SITE_PAGES = [
  '/',
  '/milestones',
  '/behind-the-scenes',
  '/case-studies/aviation-platform',
  '/case-studies/finance-forecasting',
  '/case-studies/risk-analysis',
  '/case-studies/sinalvo',
  '/lab',
  '/lab/how-its-built',
];

/** Sitemap XML for these paths on the given site origin. */
export function sitemapXml(site, paths) {
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
