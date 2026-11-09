import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Kairo — Anime, movies and manhwa",
    short_name: "Kairo",
    description: "Watch anime and movies, and read manhwa and manga, in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["books", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Library", url: "/bookmarks" },
      { name: "Browse", url: "/series" },
      { name: "Search", url: "/search" },
    ],
  };
}
