import type { Metadata } from "next";
import { Library } from "@/components/Library";

export const metadata: Metadata = { title: "Library" };

export default function BookmarksPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-5 pt-10 sm:px-8">
      <Library />
    </div>
  );
}
