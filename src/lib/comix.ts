import "server-only";
import { chromium, type Browser } from "playwright";
import { cacheLife } from "next/cache";
import type { BrowseOptions, Chapter, Series } from "./mangadex";
import { plainText } from "./source-http";
import { img } from "./images";
import { load } from "cheerio";
import { imageSignature } from "./image-signing";

// Comix's public site creates a short-lived token in its browser runtime.
// Use the site's normal navigation and responses rather than storing credentials.
let browser: Promise<Browser> | undefined;
let queue: Promise<unknown> = Promise.resolve();
async function publicPage(path: string) {
  const run = queue.then(async () => {
    browser ??= chromium
      .launch({ headless: true, channel: "chromium" })
      .catch((e) => {
        browser = undefined;
        throw e;
      });
    const context = await (await browser).newContext();
    const page = await context.newPage();
    const payloads: unknown[] = [];
    const readerImages: string[] = [];
    const jobs: Promise<void>[] = [];
    const catalogResponse = path.startsWith("/browse")
      ? page
          .waitForResponse(
            (r) =>
              r.url().startsWith("https://comix.to/api/v1/manga?") && r.ok(),
            { timeout: 20000 },
          )
          .then((r) => r.json())
          .then((j) => {
            payloads.push(j);
          })
          .catch(() => {})
      : undefined;
    page.on("response", (response) => {
      if (
        response.ok() &&
        response.url().startsWith("https://comix.to/api/v1/")
      ) {
        jobs.push(
          response
            .json()
            .then((j) => {
              payloads.push(j);
            })
            .catch(() => {}),
        );
      }
    });
    try {
      await page.goto(`https://comix.to${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      if (path.startsWith("/browse")) await catalogResponse;
      else if (/\/\d+-chapter-/.test(path)) {
        await page.waitForSelector(".rpage-page", { timeout: 20000 });
        const count = await page.locator(".rpage-page").count();
        for (let i = 0; i < count; i++) {
          await page.locator(".rpage-page").nth(i).scrollIntoViewIfNeeded();
          await page
            .locator(".rpage-page")
            .nth(i)
            .locator("img[src]")
            .waitFor({ timeout: 10000 });
          readerImages.push(
            (await page
              .locator(".rpage-page")
              .nth(i)
              .locator("img[src]")
              .getAttribute("src")) ?? "",
          );
        }
      } else {
        await page.waitForSelector('a[href*="-chapter-"]', { timeout: 18000 });
        // Walk the site's chapter pagination, preserving all translation groups.
        const collected = new Map<string, string>();
        const expectedText = await page.locator(".mchap-foot__hint").textContent().catch(() => "");
        const expected = Number(expectedText?.match(/of\s+([\d,]+)/)?.[1]?.replaceAll(",", "")) || 0;
        for (let i = 0; i < 300; i++) {
          const rows = await page
            .locator('a[href*="-chapter-"]')
            .evaluateAll((els) =>
              els.map((e) => ({
                href: (e as HTMLAnchorElement).getAttribute("href")!,
                html: e.closest(".mchap-item")?.outerHTML ?? e.outerHTML,
              })),
            );
          for (const row of rows) collected.set(row.href, row.html);
          const next = page.locator(
            '.mpage__chapters button[aria-label="Next page"]',
          );
          if (!(await next.count()) || (await next.isDisabled())) break;
          if (i === 299)
            throw new Error(
              "Comix chapter list exceeds the supported page count.",
            );
          const before = await page
            .locator(".mchap-list .mchap-row__primary")
            .first()
            .getAttribute("href");
          await page.waitForTimeout(650);
          await next.dispatchEvent("click");
          await page.waitForFunction(
            (previous) => {
              const href = document.querySelector(".mchap-list .mchap-row__primary")?.getAttribute("href");
              return !!href && href !== previous;
            },
            before,
            { timeout: 20000 },
          );
        }
        if (expected && collected.size < expected) throw new Error("Comix returned an incomplete chapter list.");
        await page.evaluate(
          (html) => {
            const el = document.createElement("div");
            el.id = "reader-chapter-index";
            el.innerHTML = html;
            document.body.append(el);
          },
          [...collected.values()].join(""),
        );
      }
      await page.waitForTimeout(1200);
      await Promise.all(jobs);
      const initial = await page
        .locator("#initial-data")
        .textContent()
        .catch(() => null);
      const images = readerImages.length
        ? readerImages
        : await page
            .locator(".rpage-page__img")
            .evaluateAll((els) =>
              els.map((el) => (el as HTMLImageElement).src),
            );
      return {
        payloads,
        initial: initial ? JSON.parse(initial) : {},
        images,
        html: await page.content(),
      };
    } catch {
      throw new Error(
        "Comix could not load its public catalog. Try again or choose another source.",
      );
    } finally {
      await context.close();
    }
  });
  queue = run.catch(() => {});
  return run;
}
type Raw = {
  hid: string;
  title: string;
  altTitles?: string[];
  synopsis?: string;
  type: string;
  status: string;
  year?: number;
  poster?: { large?: string; medium?: string };
  url?: string;
  contentRating?: string;
  authors?: { title: string }[];
  artists?: { title: string }[];
  genres?: { title: string }[];
  latestChapter?: number;
};
function mapSeries(s: Raw): Series {
  return {
    id: `comix~${s.hid}`,
    title: s.title,
    altTitles: s.altTitles ?? [],
    description: plainText(s.synopsis ?? ""),
    status:
      (
        {
          releasing: "ongoing",
          finished: "completed",
          on_hiatus: "hiatus",
        } as Record<string, string>
      )[s.status] ?? s.status,
    year: s.year ?? null,
    type: s.type ? s.type[0].toUpperCase() + s.type.slice(1) : "Comic",
    cover: s.poster?.large ?? s.poster?.medium ?? null,
    tags: (s.genres ?? []).map((g) => ({
      id: g.title,
      name: g.title,
      group: "genre",
    })),
    authors: s.authors?.map((a) => a.title) ?? [],
    artists: s.artists?.map((a) => a.title) ?? [],
    contentRating: s.contentRating ?? "safe",
    lastChapter: s.latestChapter ? String(s.latestChapter) : null,
    updatedAt: "",
  };
}
// Raw response schemas belong to the upstream site and are checked at each boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findResult(payloads: unknown[], test: (result: any) => boolean) {
  for (const payload of payloads) {
    const result = (payload as { result?: unknown }).result;
    if (result && test(result)) return result;
  }
  return null;
}
export async function browseComix(opts: BrowseOptions) {
  "use cache";
  cacheLife("minutes");
  const p = new URLSearchParams({ page: String(opts.page ?? 1) });
  if (opts.q) p.set("keyword", opts.q);
  if (opts.type && opts.type !== "all") p.append("types[]", opts.type);
  p.set(
    `order[${opts.q ? "relevance" : opts.order === "latestUploadedChapter" ? "chapter_updated_at" : opts.order === "title" ? "title" : opts.order === "createdAt" ? "created_at" : "score"}]`,
    opts.order === "title" ? "asc" : "desc",
  );
  const { payloads } = await publicPage(`/browse?${p}`);
  const result = findResult(
    payloads,
    (r) => Array.isArray(r.items) && !!r.meta,
  ) as {
    items: Raw[];
    meta: { total: number; lastPage: number; page: number };
  } | null;
  if (!result)
    throw new Error(
      "Comix did not return a catalog. Please retry or choose another source.",
    );
  return {
    series: result.items.map(mapSeries),
    total: result.meta.total,
    pages: result.meta.lastPage,
    page: result.meta.page,
  };
}
function comixId(id: string) {
  const raw = id.split("~")[1];
  if (!raw || !/^[a-zA-Z0-9]+$/.test(raw))
    throw new Error("Invalid Comix title.");
  return raw;
}
export async function comixDetail(id: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });
  const data = await publicPage(`/title/${comixId(id)}`);
  const raw =
    Object.values(data.initial.queries ?? {}).find(
      (v) => !!v && typeof v === "object" && "hid" in v && "title" in v,
    ) ?? findResult(data.payloads, (r) => !!r.hid && !!r.title);
  if (!raw || typeof raw !== "object" || !("hid" in raw))
    throw new Error("Comix title details are unavailable.");
  return { raw: raw as Raw, html: data.html };
}
export async function getComixSeries(id: string) {
  return mapSeries((await comixDetail(id)).raw);
}
export async function getComixUploads(id: string): Promise<Chapter[]> {
  const data = await comixDetail(id);
  const $ = load(data.html);
  const chapters = new Map<string, Chapter>();
  $('#reader-chapter-index a[href*="/title/"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/\/title\/[^/]+\/(\d+-chapter-([\d.]+))/);
    if (!match) return;
    const chapterId = `${id}~${match[1]}`;
    chapters.set(chapterId, {
      id: chapterId,
      number: match[2],
      title: $(el).find(".mchap-row__title").text().trim() || null,
      volume:
        $(el)
          .find(".mchap-row__vol")
          .text()
          .replace(/^Vol\.?\s*/, "") || null,
      pages: 0,
      externalUrl: null,
      readableAt: "",
      group:
        $(el).closest(".mchap-item").find(".mchap-row__group").text().trim() ||
        "Comix",
    });
  });
  if (!chapters.size)
    throw new Error(
      "Comix did not return its chapter list. Try another source.",
    );
  return [...chapters.values()].sort(
    (a, b) => Number(b.number) - Number(a.number),
  );
}
export async function getComixChapters(id: string) {
  const byNumber = new Map<string, Chapter>();
  for (const chapter of await getComixUploads(id))
    if (!byNumber.has(chapter.number!)) byNumber.set(chapter.number!, chapter);
  return [...byNumber.values()];
}
export async function getComixChapter(id: string) {
  const mangaId = id.split("~").slice(0, 2).join("~");
  const chapter = (await getComixUploads(mangaId)).find((c) => c.id === id);
  if (!chapter) throw new Error("Comix chapter unavailable.");
  return { mangaId, chapter };
}
export async function getComixPages(id: string) {
  "use cache";
  cacheLife("minutes");
  const chapterId = id.split("~")[2];
  if (!chapterId || !/^\d+-chapter-[\d.]+$/.test(chapterId))
    throw new Error("Invalid chapter.");
  const detail = await comixDetail(id);
  const data = await publicPage(`${detail.raw.url}/${chapterId}`);
  const pages = data.images.filter((src) => /^https:\/\//.test(src));
  if (!pages.length)
    throw new Error(
      "Comix's reader did not expose page images. Choose another source.",
    );
  return pages.map((src) => ({
    src: `${img(src)}&sig=${imageSignature(src)}`,
    hd: `${img(src, { hd: true })}&sig=${imageSignature(src)}`,
  }));
}
