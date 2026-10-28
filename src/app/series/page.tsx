import { BrowseCatalog } from "@/components/BrowseCatalog";
export const metadata = { title: "Browse" };
export default function SeriesIndex({ searchParams }: PageProps<"/series">) {
  return <BrowseCatalog searchParams={searchParams} />;
}
