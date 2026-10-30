import type { Metadata } from "next";
import { Updates } from "@/components/Updates";

export const metadata: Metadata = { title: "Updates" };

export default function UpdatesPage() {
  return <Updates />;
}
