import type { Metadata } from "next";
import { Library } from "@/components/Library";

export const metadata: Metadata = { title: "My List" };

export default function BookmarksPage() {
  return (
    <div className="gutter mx-auto max-w-[2560px] pt-3 lg:pt-8">
      <Library />
    </div>
  );
}
