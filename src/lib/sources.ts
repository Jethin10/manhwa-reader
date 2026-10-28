/**
 * Connected sources, best image quality first. `quality` drives automatic selection when the
 * same chapter exists on several sources; it reflects how close each host serves the originals.
 */
export const PROVIDERS = [
  { id: "asura", name: "Asura Scans", quality: 5, note: "Original-resolution webtoon scans" },
  { id: "mangadex", name: "MangaDex", quality: 4, note: "Uploader originals, many languages" },
  { id: "weebcentral", name: "WeebCentral", quality: 3, note: "Large English catalog" },
  { id: "comix", name: "Comix", quality: 2, note: "Broad catalog, slower to load" },
  { id: "mangapill", name: "MangaPill", quality: 1, note: "Fast manga releases" },
] as const;
export type ProviderId = (typeof PROVIDERS)[number]["id"];

export const SOURCES = [{ id: "all", name: "All sources" }, ...PROVIDERS] as const;
export type SourceId = (typeof SOURCES)[number]["id"];

export function sourceId(value: string): SourceId {
  return SOURCES.find((s) => s.id === value)?.id ?? "all";
}
/** Non-MangaDex ids are prefixed with their provider: `asura~slug`, `weebcentral~ULID~ULID`. */
export function providerOf(id: string): ProviderId {
  const prefix = id.split("~")[0];
  return PROVIDERS.find((p) => p.id === prefix && id.includes("~"))?.id ?? "mangadex";
}
export function sourceOf(id: string) {
  const p = providerOf(id);
  return PROVIDERS.find((x) => x.id === p)!.name;
}
export function qualityOf(id: string) {
  const p = providerOf(id);
  return PROVIDERS.find((x) => x.id === p)!.quality;
}
