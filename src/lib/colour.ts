import { normalizeTitle } from "./titles";

/** MangaDex format tags for coloured editions: Official Colored, Fan Colored, Full Color. */
export const COLOUR_TAGS = [
  "320831a8-4026-470b-94f6-8353740e6f04",
  "7b2ce280-79ef-4c09-9b58-12b7c23a9b78",
  "f5ba408b-0e7a-484d-8d49-4e9125ac96de",
];

// "(Fan Colored)", "Digital Colored Comics", "Full Color Selection", "Color-ban", "Colored"...
const COLOUR_WORDS =
  /\(?\s*\b(?:official|fan|digital)?\s*(?:full[\s-]*)?colou?r(?:ed)?\b(?:[\s-]*(?:ban|edition|version|comics|selection))?\s*\)?/gi;
// Stricter than COLOUR_WORDS, so "Color of Rage" or "Colorful" are not taken for colour editions.
const COLOUR_TITLE =
  /\bcolou?red\b|\bfull[\s-]*colou?r\b|\bcolou?r[\s-](?:ban|edition|version)\b|\(colou?r\)|\bcolou?r\s*$/i;

type Tagged = { title: string; altTitles?: string[]; tags?: { id: string; name: string }[] };

/** A coloured edition, from MangaDex's format tags or, on other sources, its title. */
export function isColour(s: Tagged) {
  if (s.tags?.some((t) => COLOUR_TAGS.includes(t.id) || /colou?red|full colou?r/i.test(t.name)))
    return true;
  return [s.title, ...(s.altTitles ?? [])].some((t) => COLOUR_TITLE.test(t));
}

/** The title with its colour suffix removed: "Blue Lock (Fan Colored)" -> "Blue Lock". */
export function stripColour(title: string) {
  return title.replace(COLOUR_WORDS, " ").replace(/\s+/g, " ").trim();
}

/** Whether `edition` is a coloured edition of `series` (same title once colour words are dropped). */
export function isColourEditionOf(edition: Tagged, series: Tagged) {
  if (!isColour(edition) || isColour(series)) return false;
  const base = new Set(
    [series.title, ...(series.altTitles ?? [])].map(normalizeTitle).filter((k) => k.length > 2),
  );
  return [edition.title, ...(edition.altTitles ?? [])]
    .map((t) => normalizeTitle(stripColour(t)))
    .some((k) => base.has(k));
}
