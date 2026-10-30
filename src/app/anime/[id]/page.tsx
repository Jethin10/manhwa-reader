import { Suspense } from "react";
import type { Metadata } from "next";
import { getAnime, getAnimeFranchise, type FranchiseEntry } from "@/lib/anime";
import { AnimeFranchise } from "@/components/AnimeFranchise";
import { AnimePlayer } from "@/components/AnimePlayer";
import { SourceIssue } from "@/components/SourceIssue";
export async function generateMetadata({
  params,
}: PageProps<"/anime/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getAnime(id).catch(() => null);
  return { title: data ? data.anime.title : "Anime unavailable" };
}

export default function AnimeWatchPage({
  params,
  searchParams,
}: PageProps<"/anime/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1400px] px-5 py-10">
          <div className="skeleton aspect-video rounded-2xl" />
          <p className="mt-5 text-secondary">Loading episodes...</p>
        </div>
      }
    >
      <Watch params={params} searchParams={searchParams} />
    </Suspense>
  );
}
async function Watch({ params, searchParams }: PageProps<"/anime/[id]">) {
  const { id } = await params,
    sp = await searchParams;
  const data = await getAnime(id).catch(() => null);
  if (!data)
    return (
      <SourceIssue
        href="/anime"
        message="This anime could not be loaded. Try another title or return to the catalog."
      />
    );
  // The player comes first; seasons and movies follow ("Seasons & movies" jumps there).
  return (
    <>
      <AnimePlayer
        key={id}
        {...data}
        initialEpisode={typeof sp.ep === "string" ? sp.ep : ""}
        initialAudio={sp.audio === "dub" ? "dub" : sp.audio === "sub" ? "sub" : undefined}
      />
      <Suspense
        fallback={<AnimeFranchise entries={data.franchise} currentId={id} />}
      >
        <Franchise
          title={data.anime.title}
          linked={data.franchise}
          currentId={id}
        />
      </Suspense>
    </>
  );
}
async function Franchise({
  title,
  linked,
  currentId,
}: {
  title: string;
  linked: FranchiseEntry[];
  currentId: string;
}) {
  const entries = await getAnimeFranchise(title, linked);
  return <AnimeFranchise entries={entries} currentId={currentId} />;
}
