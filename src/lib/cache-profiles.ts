/**
 * Browse lists and ratings from the sources: fresh for 5 minutes, refreshed in the
 * background every 15, and kept for a day. Visitors get a list instantly instead of waiting
 * on slow scraped sources. Used with "use cache: remote", shared by every server instance.
 */
export const CATALOG_CACHE = { stale: 300, revalidate: 900, expire: 86400 };
