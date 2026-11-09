export type Movie = {
  id: string;
  title: string;
  poster: string;
  background: string;
  year: string;
  rating: string;
  genres: string[];
  description: string;
  runtime: string;
  country: string;
  cast: string[];
  director: string[];
  tmdbId?: string;
};

export const isMovieId = (id: unknown): id is string =>
  typeof id === "string" && /^tt\d{5,12}$/.test(id);
export const MOVIE_CATEGORIES = [
  ["popular", "Popular"],
  ["telugu", "Telugu picks"],
  ["indian", "Indian picks"],
  ["new", "New releases"],
  ["rating", "Featured"],
] as const;
export type MovieCategory = (typeof MOVIE_CATEGORIES)[number][0];

export function movieImage(raw: unknown): string {
  if (typeof raw !== "string") return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
