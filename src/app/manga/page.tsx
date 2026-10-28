import { BrowseCatalog } from "@/components/BrowseCatalog";
export const metadata = {
  title: "Manga",
  description:
    "Browse Japanese manga, choose a source, and read in right-to-left or spread mode.",
};
export default function MangaPage({ searchParams }: PageProps<"/manga">) {
  return <BrowseCatalog searchParams={searchParams} initialType="manga" />;
}
