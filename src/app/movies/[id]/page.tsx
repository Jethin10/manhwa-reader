import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getMovie } from "@/lib/movies";
import { isMovieId } from "@/lib/movie-types";
import { MovieDetail } from "@/components/MovieDetail";
import { MovieRetry } from "@/components/MovieRetry";
import MovieLoading from "./loading";
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export const metadata = { title: "Watch movie" };
export default function MoviePage(props: Props) {
  return (
    <Suspense fallback={<MovieLoading />}>
      <Content {...props} />
    </Suspense>
  );
}
async function Content({ params, searchParams }: Props) {
  const { id } = await params;
  if (!isMovieId(id)) notFound();
  const sp = await searchParams;
  const movie = await getMovie(id).catch(() => null);
  if (!movie)
    return (
      <div className="gutter mx-auto max-w-3xl py-16">
        <h1 className="t-title1">Movie details couldn’t load</h1>
        <p role="alert" className="t-callout mt-3 text-secondary">
          The movie catalog may be unavailable, or this ID isn’t listed. Retry
          or search for another title.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <MovieRetry />
          <Link href="/movies" prefetch={false} className="btn btn-gray">
            Search movies
          </Link>
        </div>
      </div>
    );
  return <MovieDetail movie={movie} startWatching={sp.watch === "1"} />;
}
