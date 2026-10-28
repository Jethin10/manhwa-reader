/** Folds punctuation, articles and season suffixes so "The Greatest Estate Developer" matches across sources. */
export function normalizeTitle(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\((?:manhwa|manga|manhua|webtoon|official)\)/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

type Titled = { title: string; altTitles?: string[] };

function keys(s: Titled) {
  return new Set([s.title, ...(s.altTitles ?? [])].map(normalizeTitle).filter((k) => k.length > 2));
}

export function sameTitle(a: Titled, b: Titled) {
  const ka = keys(a);
  for (const k of keys(b)) if (ka.has(k)) return true;
  return false;
}

/** Chapter numbers compare numerically: "12", "12.0" and "012" are one chapter. */
export function chapterKey(number: string | null) {
  const n = parseFloat(number ?? "");
  return Number.isFinite(n) ? String(n) : null;
}
