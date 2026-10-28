export const SOURCES = [
  { id: "all", name: "All connected sources" },
  { id: "asura", name: "Asura Scans" },
  { id: "comix", name: "Comix" },
  { id: "mangadex", name: "MangaDex" },
] as const;
export type SourceId = (typeof SOURCES)[number]["id"];
export function sourceId(value: string): SourceId {
  return SOURCES.find((s) => s.id === value)?.id ?? "all";
}
export function sourceOf(id: string) {
  return id.startsWith("asura~")
    ? "Asura Scans"
    : id.startsWith("comix~")
      ? "Comix"
      : "MangaDex";
}
