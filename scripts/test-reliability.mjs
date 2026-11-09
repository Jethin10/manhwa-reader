import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
function loader(mocks = {}, globals = {}, expose = {}) {
  const modules = new Map();
  const load = (file) => {
    const path = resolve(file);
    if (modules.has(path)) return modules.get(path).exports;
    const compiled = { exports: {} };
    modules.set(path, compiled);
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const context = createContext({
      module: compiled,
      exports: compiled.exports,
      console,
      Buffer,
      Request,
      Response,
      Headers,
      URL,
      URLSearchParams,
      AbortSignal,
      AbortController,
      Event,
      DOMException,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      ...globals,
      require: (name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name === "server-only") return {};
        if (name.startsWith("."))
          return load(resolve(dirname(path), `${name}.ts`));
        if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
        return nativeRequire(name);
      },
    });
    runInContext(source + (expose[path] ?? ""), context, { filename: path });
    return compiled.exports;
  };
  return load;
}
const drain = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

test("primary chapters start while mirror discovery is pending", async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const calls = [];
  const load = loader({
    "next/cache": { cacheLife() {} },
    react: { cache: (fn) => fn },
    "./catalog": {
      getSeries: async () => ({ title: "Example", altTitles: [] }),
      getAllUploads: async (id) => {
        calls.push(id);
        return [];
      },
      withTimeout: (p) => p,
      providers: {
        mirror: {
          browse: async () => {
            await gate;
            return { series: [] };
          },
        },
      },
    },
    "./sources": {
      PROVIDERS: [
        { id: "main", name: "Main" },
        { id: "mirror", name: "Mirror" },
      ],
      providerOf: (id) => id.split("~")[0],
      sourceOf: (id) => id,
      qualityOf: () => 1,
    },
    "./titles": { chapterKey: (n) => n, sameTitle: () => false },
    "./format": { errorText: () => "Unavailable" },
  });
  const promise = load("src/lib/unified.ts").getMergedChapters("main~one");
  await drain();
  const started = calls.includes("main~one");
  release();
  await promise;
  assert.equal(
    started,
    true,
    "The primary source must not wait for mirror searches",
  );
});

function frameHarness() {
  let now = 0;
  const listeners = new Map(),
    intervals = new Set(),
    timers = new Set(),
    effects = [],
    errors = [];
  const frameWindow = { postMessage() {} };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useRef: (value) => ({ current: value }),
    useState: (value) => [
      typeof value === "function" ? value() : value,
      () => {},
    ],
    useEffect: (fn) => effects.push(fn),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
  };
  const load = loader(
    {
      react,
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
      "./toast": { toast() {} },
      "./MediaSheet": { MediaSheet: () => null },
      "./Icons": { ChevronLeft: () => null },
      "@/lib/movie-library": {},
      "@/lib/movie-providers": {
        decodeMovieEvent: (_provider, data) => data,
        availableProviders: () => [],
      },
    },
    {
      Date: { now: () => now },
      window: {
        addEventListener: (key, fn) => listeners.set(key, fn),
        removeEventListener: (key) => listeners.delete(key),
      },
      setTimeout: (fn) => {
        timers.add(fn);
        return fn;
      },
      clearTimeout: (fn) => timers.delete(fn),
      setInterval: (fn) => {
        intervals.add(fn);
        return fn;
      },
      clearInterval: (fn) => intervals.delete(fn),
    },
    {
      [resolve("src/components/MoviePlayer.tsx")]:
        "\nexports.__frame = MovieFrame;",
    },
  );
  const frame = load("src/components/MoviePlayer.tsx").__frame({
    movie: { id: "tt8178634" },
    provider: {
      id: "fixture",
      origin: "https://fixture.test",
      name: "Fixture",
      url: () => "https://fixture.test/movie",
    },
    options: { startAt: 0 },
    timeout: 20,
    command: null,
    onEvent: (event) => {
      if (event.event === "error") errors.push(event);
    },
  });
  const attach = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "iframe")
      node.props.ref.current = { contentWindow: frameWindow };
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children])
      attach(child);
  };
  attach(frame);
  const cleanups = effects.map((fn) => fn());
  return {
    emit(event, at) {
      now = at;
      listeners.get("message")({
        origin: "https://fixture.test",
        source: frameWindow,
        data: event,
      });
    },
    tick(at) {
      now = at;
      intervals.forEach((fn) => fn());
    },
    errors,
    close() {
      cleanups.forEach((fn) => fn?.());
      assert.equal(intervals.size, 0);
      assert.equal(timers.size, 0);
    },
  };
}
test("backward seeking does not cause a false playback stall", () => {
  const h = frameHarness();
  h.emit({ event: "play", time: 100 }, 0);
  h.emit({ event: "timeupdate", time: 105 }, 1000);
  for (let i = 0; i < 25; i++) {
    h.emit({ event: "timeupdate", time: 5 + i }, 2000 + i * 1000);
    h.tick(2000 + i * 1000);
  }
  h.close();
  assert.equal(
    h.errors.length,
    0,
    "Healthy playback after a backward seek must not trigger fallback",
  );
});
test("pause progress stops the watchdog; real stalls still fail once", () => {
  const paused = frameHarness();
  paused.emit({ event: "play", time: 5 }, 0);
  paused.emit({ event: "pause", time: 10, duration: 100 }, 1000);
  paused.tick(30000);
  paused.close();
  assert.equal(
    paused.errors.length,
    0,
    "A pause containing currentTime must remain paused",
  );
  const stalled = frameHarness();
  stalled.emit({ event: "play", time: 5 }, 0);
  stalled.tick(21000);
  stalled.tick(40000);
  stalled.close();
  assert.equal(
    stalled.errors.length,
    1,
    "Report one failure for a genuine stall",
  );
});

test("image backoff does not block another host", async () => {
  let healthyStarted = false;
  const timers = [];
  const load = loader(
    {
      "node:fs/promises": {
        readFile: async () => {
          throw new Error("Cache miss");
        },
        mkdir: async () => {},
        writeFile: async () => {},
      },
      sharp: () => {
        throw new Error("Unused for originals");
      },
      "@/lib/image-signing": { validImageSignature: () => false },
      "@/lib/relay": { relayEnabled: () => false },
    },
    {
      process: { env: { IMAGE_PROCESSING: "off" } },
      fetch: async (input) => {
        if (String(input).includes("healthy")) {
          healthyStarted = true;
          return new Response(new Uint8Array([255, 216, 255, 217]), {
            headers: { "Content-Type": "image/jpeg" },
          });
        }
        throw new Error("Host unavailable");
      },
      setTimeout: (fn) => {
        timers.push(fn);
        return fn;
      },
      clearTimeout() {},
    },
  );
  const { GET } = load("src/app/api/img/route.ts");
  for (let i = 0; i < 6; i++)
    void GET(
      new Request(
        `https://app.test/api/img?u=${encodeURIComponent(`https://uploads.mangadex.org/failure-${i}.jpg`)}`,
      ),
    ).catch(() => {});
  await drain();
  const good = GET(
    new Request(
      "https://app.test/api/img?u=https%3A%2Fhianime.tr%2Fhealthy.jpg",
    ),
  );
  await drain();
  assert.equal(
    healthyStarted,
    true,
    "A healthy host must get a slot while another host backs off",
  );
  assert.equal((await good).status, 200);
});

test("download completion waits for workers and metadata must be durable", async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const cache = {
    match: async () => null,
    put: async () => {},
    delete: async () => true,
  };
  let full = false;
  const load = loader(
    { react: { useSyncExternalStore() {} }, "./toast": { toast() {} } },
    {
      Blob,
      localStorage: {
        getItem: () => null,
        setItem: () => {
          if (full) throw new DOMException("Full", "QuotaExceededError");
        },
      },
      window: { addEventListener() {}, removeEventListener() {} },
      caches: { open: async () => cache },
      fetch: async (input) => {
        const url = String(input);
        if (url.startsWith("/api/chapter/pages"))
          return Response.json({ pages: [{ src: "/ok.jpg" }] });
        if (url === "/downloads") return new Response("", { status: 503 });
        return {
          ok: true,
          headers: new Headers({ "content-type": "image/jpeg" }),
          blob: async () => {
            await gate;
            return new Blob(["image"], { type: "image/jpeg" });
          },
        };
      },
    },
    {
      [resolve("src/lib/downloads.ts")]:
        "\nexports.__download = download; exports.__load = load;",
    },
  );
  const downloads = load("src/lib/downloads.ts");
  full = true;
  const job = {
    id: "one",
    number: "1",
    title: null,
    series: { id: "s", title: "Series" },
    state: "queued",
    done: 0,
    total: 0,
  };
  const pending = downloads.__download(job);
  await drain();
  release();
  assert.equal(
    await pending,
    false,
    "A chapter is not downloaded if its index could not be saved",
  );
  assert.equal(job.state, "failed");
  assert.equal(
    downloads.__load().one,
    undefined,
    "Do not publish an entry that disappears on reload",
  );
});

test("failed download waits for its remaining page workers", async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  let completed = false;
  const load = loader(
    { react: { useSyncExternalStore() {} }, "./toast": { toast() {} } },
    {
      Blob,
      localStorage: { getItem: () => null, setItem() {} },
      window: { addEventListener() {}, removeEventListener() {} },
      caches: {
        open: async () => ({
          match: async () => null,
          put: async () => {},
          delete: async () => true,
        }),
      },
      setTimeout: (fn) => {
        queueMicrotask(fn);
        return 0;
      },
      fetch: async (input) => {
        const url = String(input);
        if (url.startsWith("/api/chapter/pages"))
          return Response.json({
            pages: [{ src: "/bad.jpg" }, { src: "/slow.jpg" }],
          });
        if (url === "/bad.jpg") return new Response("Missing", { status: 404 });
        return {
          ok: true,
          headers: new Headers({ "content-type": "image/jpeg" }),
          blob: async () => {
            await gate;
            return new Blob(["image"], { type: "image/jpeg" });
          },
        };
      },
    },
    { [resolve("src/lib/downloads.ts")]: "\nexports.__download = download;" },
  );
  const pending = load("src/lib/downloads.ts")
    .__download({
      id: "one",
      number: "1",
      title: null,
      series: { id: "s", title: "S" },
      state: "queued",
      done: 0,
      total: 0,
    })
    .then(() => {
      completed = true;
    });
  await drain();
  await new Promise(setImmediate);
  const before = completed;
  release();
  await pending;
  assert.equal(
    before,
    false,
    "Do not release the chapter queue while a page worker can still write",
  );
});

test("a full device does not crash a library status change", () => {
  const load = loader(
    { react: { useSyncExternalStore() {} }, "./toast": { toast() {} } },
    {
      localStorage: {
        getItem: () => "[]",
        setItem: () => {
          throw new DOMException("Full", "QuotaExceededError");
        },
      },
      window: new EventTarget(),
    },
  );
  const collection = load("src/lib/collection.ts");
  assert.doesNotThrow(() =>
    collection.setCollection(
      {
        id: "tt8178634",
        title: "RRR",
        media: "movie",
        cover: null,
        type: "Movie",
      },
      "planned",
    ),
  );
  assert.equal(collection.getCollection().length, 0);
});

test("failed suggestions are shown as a failure, not cached as no matches", async () => {
  const effects = [],
    state = ["RRR", true, null, -1];
  let index = 0;
  const jsx = (type, props) => ({ type, props });
  const load = loader(
    {
      react: {
        useRef: (v) => ({ current: v }),
        useState: () => {
          const i = index++;
          return [
            state[i],
            (next) => {
              state[i] = next;
            },
          ];
        },
        useEffect: (fn) => effects.push(fn),
        useId: () => "search",
      },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/link": () => null,
      "next/navigation": { useRouter: () => ({ push() {} }) },
      "./Icons": {},
      "./RetryImg": {},
    },
    {
      window: { addEventListener() {}, removeEventListener() {} },
      document: { addEventListener() {}, removeEventListener() {} },
      fetch: async () => new Response("Unavailable", { status: 503 }),
      setTimeout: (fn) => {
        queueMicrotask(fn);
        return 0;
      },
    },
  );
  load("src/components/SearchBox.tsx").SearchBox({ section: "movies" });
  const cleanups = effects.map((fn) => fn());
  await drain();
  cleanups.forEach((fn) => fn?.());
  assert.equal(
    state[2]?.failed,
    true,
    "An unavailable API must remain distinguishable from a successful empty search",
  );
});

test("request pools bound concurrency, bypass busy hosts and cancel queued jobs", async () => {
  const { taskPool, QueueFullError } = loader()("src/lib/concurrency.ts");
  const pool = taskPool(2, 1, 2);
  let release,
    queuedRan = false;
  const gate = new Promise((r) => {
    release = r;
  });
  const first = pool("slow", () => gate);
  const ctrl = new AbortController();
  const queued = pool(
    "slow",
    async () => {
      queuedRan = true;
    },
    ctrl.signal,
  );
  const healthy = pool("healthy", async () => "healthy");
  assert.equal(await healthy, "healthy");
  ctrl.abort(new Error("Cancelled"));
  await assert.rejects(queued, /Cancelled/);
  assert.equal(queuedRan, false);
  const extra = pool("slow", async () => "extra");
  const last = pool("slow", async () => "last");
  assert.equal(
    await pool("healthy", async () => "available"),
    "available",
    "A full waiting list for one host must not reject another host with capacity",
  );
  await assert.rejects(
    pool("slow", async () => "overload"),
    QueueFullError,
  );
  release("first");
  assert.equal(await first, "first");
  assert.equal(await extra, "extra");
  assert.equal(await last, "last");
});

test("completed catalog requests release their deadline timers", async () => {
  const timers = new Set();
  const empty = {};
  const load = loader(
    {
      "./mangadex": empty,
      "./asura": empty,
      "./mangakatana": empty,
      "./weebcentral": empty,
      "./mangapill": empty,
      "./sources": { PROVIDERS: [] },
      "./titles": {},
      "./format": {},
    },
    {
      setTimeout: (fn) => {
        timers.add(fn);
        return fn;
      },
      clearTimeout: (fn) => timers.delete(fn),
    },
    { [resolve("src/lib/catalog.ts")]: "\nexports.__settle = settleSoon;" },
  );
  const catalog = load("src/lib/catalog.ts");
  assert.equal(
    await catalog.withTimeout(Promise.resolve("ok"), 1000, "Source"),
    "ok",
  );
  assert.equal(timers.size, 0);
  await assert.rejects(
    catalog.withTimeout(Promise.reject(new Error("Bad")), 1000, "Source"),
    /Bad/,
  );
  assert.equal(timers.size, 0);
  await catalog.__settle([Promise.resolve("ok")], 50, 1000, ["Source"]);
  assert.equal(timers.size, 0);
});

test("original image bytes are preserved and simultaneous resizes share decoding", async () => {
  const writes = [];
  let decodeCount = 0,
    release;
  const gate = new Promise((r) => {
    release = r;
  });
  const original = new Uint8Array([255, 216, 255, 217]);
  const output = new Uint8Array([82, 73, 70, 70]);
  const load = loader(
    {
      "node:fs/promises": {
        readFile: async () => {
          throw new Error("Cache miss");
        },
        mkdir: async () => {},
        writeFile: async (file) => {
          writes.push(file);
        },
      },
      sharp: () => {
        decodeCount++;
        return {
          resize() {
            return this;
          },
          webp({ quality }) {
            assert.equal(quality, 90);
            return this;
          },
          toBuffer: async () => {
            await gate;
            return Buffer.from(output);
          },
        };
      },
      "@/lib/image-signing": { validImageSignature: () => false },
      "@/lib/relay": { relayEnabled: () => false },
    },
    {
      process: { env: {} },
      fetch: async () =>
        new Response(original, { headers: { "content-type": "image/jpeg" } }),
    },
  );
  const { GET } = load("src/app/api/img/route.ts");
  const raw = await GET(
    new Request(
      "https://app.test/api/img?u=https%3A%2Fhianime.tr%2Fsample.jpg",
    ),
  );
  assert.deepEqual(new Uint8Array(await raw.arrayBuffer()), original);
  const pending = Array.from({ length: 5 }, () =>
    GET(
      new Request(
        "https://app.test/api/img?u=https%3A%2Fhianime.tr%2Fsample.jpg&w=320",
      ),
    ),
  );
  await drain();
  await new Promise(setImmediate);
  assert.equal(
    decodeCount,
    1,
    "Concurrent identical transforms should decode the original once",
  );
  release();
  for (const response of await Promise.all(pending)) {
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), output);
  }
  await drain();
  assert.equal(
    writes.filter((file) => file.endsWith(".webp")).length,
    1,
    "Concurrent clients should publish a resized cache file once",
  );
});

test("progress writes do not invalidate playback preferences", () => {
  const storage = new Map();
  let notices = 0;
  const load = loader(
    {
      react: {
        useSyncExternalStore: (subscribe, get) => {
          subscribe(() => {
            notices++;
          });
          return get();
        },
      },
      "./toast": { toast() {} },
    },
    {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
      window: new EventTarget(),
    },
  );
  const library = load("src/lib/movie-library.ts");
  library.useMoviePreferences();
  const before = library.getMoviePreferences();
  library.saveMovieProgress(
    { id: "tt8178634", title: "RRR", poster: "", year: "2022" },
    "cinesrc",
    10,
    100,
  );
  assert.equal(
    notices,
    0,
    "History updates must not wake every preference subscriber",
  );
  assert.equal(
    library.getMoviePreferences(),
    before,
    "Keep the unchanged settings snapshot stable",
  );
});

test("series details can render while chapter and rating requests are pending", async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { Suspense: "suspense" },
    "next/link": () => null,
    "@/lib/catalog": {
      getSeries: async () => ({
        id: "main~one",
        title: "Example",
        type: "Manhwa",
        tags: [],
        authors: [],
        artists: [],
        altTitles: [],
        description: "",
        cover: null,
        status: "ongoing",
        year: 2020,
      }),
      getChapters: async () => {
        await gate;
        return [];
      },
      getStats: async () => {
        await gate;
        return {};
      },
    },
    "@/lib/unified": {},
    "@/lib/sources": { providerOf: () => "main", sourceOf: () => "Main" },
    "@/lib/images": {},
    "@/lib/format": { cleanDescription: (v) => v, cap: (v) => v },
  };
  for (const name of [
    "SourceIssue",
    "CollectionPicker",
    "BookmarkButton",
    "ChapterList",
    "ReadButton",
    "Synopsis",
    "Icons",
  ])
    mocks[`@/components/${name}`] = {};
  const load = loader(
    mocks,
    {},
    {
      [resolve("src/app/series/[id]/page.tsx")]:
        "\nexports.__loadSeries = LoadSeries;",
    },
  );
  let ready = false;
  const render = load("src/app/series/[id]/page.tsx")
    .__loadSeries({ params: Promise.resolve({ id: "main~one" }) })
    .then(() => {
      ready = true;
    });
  await drain();
  const early = ready;
  release();
  await render;
  assert.equal(
    early,
    true,
    "The title and synopsis must not wait for chapters or decorative ratings",
  );
});
