/**
 * Browse lists and ratings from the sources: fresh for 5 minutes, refreshed in the
 * background every 15, and kept for a day. Visitors get a list instantly instead of waiting
 * on slow scraped sources. Used with "use cache: remote", shared by every server instance.
 */
export const CATALOG_CACHE = { stale: 300, revalidate: 900, expire: 86400 };

/**
 * A series' chapter list on one source, and which sources carry a series: answered instantly
 * from the shared cache, refreshed in the background every 10 minutes so new chapters show up
 * soon, and kept for a day in case a source goes down.
 */
export const CHAPTER_LIST_CACHE = { stale: 120, revalidate: 600, expire: 86400 };
