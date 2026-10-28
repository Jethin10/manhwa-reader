import type { Metadata } from "next";
import { Library } from "@/components/Library";

export const metadata: Metadata = { title: "Library" };

export default function BookmarksPage() {
  return (
    <div className="gutter mx-auto max-w-[1440px] pt-4 lg:pt-12">
      <Library />
    </div>
  );
}
