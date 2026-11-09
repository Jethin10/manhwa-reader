import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const origin = "https://app.test";
const id = "v-00000000-0000-0000-0000-000000000001";
const anime = {
  id: "anime-1",
  title: "Example anime",
  cover: "https://images.test/cover.jpg",
};
const episode = { id: "123", number: 1, title: "Episode one" };
const options = { audio: "sub", quality: "720", audioTrack: "Japanese" };
const media = {
  src: "/api/anime/stream?u=master",
  tracks: [
    {
      src: "https://relay.test/sub.vtt",
      label: "English",
      language: "en",
      default: true,
    },
  ],
  servers: [],
  audio: "Japanese",
};
const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="https://cdn.test/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Japanese",LANGUAGE="ja",DEFAULT=NO,URI="https://cdn.test/ja.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=854x480,AUDIO="audio"
https://cdn.test/480.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1920x1080,AUDIO="audio"
https://cdn.test/1080.m3u8
`;
const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-MAP:URI="init.mp4"
#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x00000000000000000000000000000001
#EXTINF:6,
first.m4s
#EXTINF:6,
second.m4s
#EXT-X-ENDLIST
`;
function fixtures() {
  return new Map([
    [`${origin}${media.src}`, master],
    ["https://cdn.test/480.m3u8", playlist],
    ["https://cdn.test/1080.m3u8", playlist],
    [
      "https://cdn.test/ja.m3u8",
      "#EXTM3U\n#EXTINF:12,\naudio.aac\n#EXT-X-ENDLIST\n",
    ],
    [
      "https://cdn.test/en.m3u8",
      "#EXTM3U\n#EXTINF:12,\nenglish.aac\n#EXT-X-ENDLIST\n",
    ],
    ["https://cdn.test/audio.aac", new Uint8Array([1, 2, 3])],
    ["https://cdn.test/english.aac", new Uint8Array([4])],
    ["https://cdn.test/init.mp4", new Uint8Array([0, 1])],
    ["https://cdn.test/key.bin", new Uint8Array(16)],
    ["https://cdn.test/first.m4s", new Uint8Array([1, 2, 3, 4])],
    ["https://cdn.test/second.m4s", new Uint8Array([5, 6, 7, 8])],
    [
      "https://relay.test/sub.vtt",
      "WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n",
    ],
  ]);
}
function modules(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    const path = resolve(file);
    if (cache.has(path)) return cache.get(path).exports;
    const compiledModule = { exports: {} };
    cache.set(path, compiledModule);
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInNewContext(
      source,
      {
        module: compiledModule,
        exports: compiledModule.exports,
        require: (name) =>
          Object.hasOwn(mocks, name)
            ? mocks[name]
            : name.startsWith(".")
              ? load(resolve(dirname(path), `${name}.ts`))
              : require(name),
        console,
        URL,
        Request,
        Response,
        Headers,
        Blob,
        AbortController,
        AbortSignal,
        DOMException,
        Error,
        Event,
        CustomEvent,
        setTimeout,
        clearTimeout,
        TextDecoder,
        crypto: { randomUUID },
        location: { origin },
        ...globals,
      },
      { filename: path },
    );
    return compiledModule.exports;
  }
  return load;
}
function harness(config = {}) {
  const files = fixtures(),
    network = [],
    entries = new Map(),
    index = new Map();
  const target = new EventTarget();
  target.isSecureContext = true;
  let savedWritesFail = false;
  const storage = {
    getItem: (key) => index.get(key) ?? null,
    setItem: (key, value) => {
      if (savedWritesFail && Object.keys(JSON.parse(value).saved ?? {}).length)
        throw new DOMException("Storage full", "QuotaExceededError");
      index.set(key, value);
    },
  };
  const urlOf = (value) =>
    new URL(typeof value === "string" ? value : value.url, origin).href;
  const cache = {
    async put(key, response) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      entries.set(urlOf(key), { bytes, headers: [...response.headers] });
    },
    async match(key) {
      const entry = entries.get(urlOf(key));
      return entry
        ? new Response(entry.bytes.slice(), { headers: entry.headers })
        : undefined;
    },
    async delete(key) {
      return entries.delete(urlOf(key));
    },
    async keys() {
      return [...entries.keys()].map((key) => new Request(key));
    },
  };
  const fetch = async (url, options = {}) => {
    const href = urlOf(url);
    network.push({ url: href, options });
    const custom = await config.fetch?.(href, options, network);
    if (custom) return custom;
    const body = files.get(href);
    return body === undefined
      ? new Response("Missing", { status: 404 })
      : new Response(body);
  };
  const globals = {
    window: target,
    fetch,
    localStorage: storage,
    caches: { open: async () => cache },
    navigator: {
      serviceWorker: { controller: {} },
      storage: {
        persist: async () => true,
        estimate: async () => config.quota ?? { quota: 10 ** 9, usage: 0 },
      },
    },
  };
  const mocks = {
    react: { useSyncExternalStore: (_, get) => get() },
    "./anime-client": { loadMedia: async () => media },
    "./toast": { toast() {} },
  };
  const loader = modules(mocks, globals);
  const engine = loader("src/lib/video-downloads.ts");
  return {
    engine,
    files,
    entries,
    network,
    index,
    cache,
    target,
    globals,
    mocks,
    setFailSaved: () => {
      savedWritesFail = true;
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 1000; i++) {
    if (predicate()) return;
    await tick();
  }
  assert.fail("Asynchronous download did not reach its expected state");
}
const settled = (engine) =>
  until(
    () =>
      !engine
        .useVideoDownloads()
        .jobs.some((job) => ["queued", "downloading"].includes(job.state)),
  );

test("HLS packaging selects one video and its requested audio, rewriting every dependency locally", async () => {
  const files = fixtures();
  const api = modules()("src/lib/offline-hls.ts");
  const plan = await api.prepareOfflineHls(
    media,
    options,
    id,
    new AbortController().signal,
    async (url) => files.get(url),
    origin,
  );
  assert.equal(plan.actualHeight, 480);
  assert.equal(plan.duration, 12);
  assert.equal(plan.media.audio, "Japanese");
  assert.equal(plan.media.src, `/offline-media/${id}/index.m3u8`);
  assert.ok(plan.resources.some((asset) => asset.source.endsWith("audio.aac")));
  assert.ok(
    !plan.resources.some((asset) => asset.source.endsWith("english.aac")),
  );
  assert.ok(
    plan.resources.some(
      (asset) => asset.keyFile && asset.source.endsWith("key.bin"),
    ),
  );
  assert.ok(plan.playlists.every((entry) => !entry.text.includes("https://")));
  assert.equal(
    plan.media.tracks[0].src.startsWith(`/offline-media/${id}/`),
    true,
  );
  const root = plan.playlists.find((entry) =>
    entry.key.endsWith("index.m3u8"),
  ).text;
  assert.ok(root.includes('NAME="Japanese"'));
  assert.ok(!root.includes('NAME="English"'));
  assert.ok(!root.includes("1920x1080"));
});

test("a requested quality ceiling never silently downloads a larger rendition", async () => {
  const api = modules()("src/lib/offline-hls.ts");
  const files = fixtures();
  files.set(
    `${origin}${media.src}`,
    master
      .split(/\r?\n/)
      .filter((line) => !line.includes("854x480") && !line.includes("480.m3u8"))
      .join("\n"),
  );
  await assert.rejects(
    api.prepareOfflineHls(
      media,
      { ...options, quality: "480" },
      id,
      new AbortController().signal,
      async (url) => files.get(url),
      origin,
    ),
    /quality limit|rendition/,
  );
});

test("unsupported live, DRM, byte ranges, and unavailable audio fail without an incomplete package", async () => {
  const api = modules()("src/lib/offline-hls.ts");
  for (const text of [
    "#EXTM3U\n#EXTINF:6,\nsegment.ts\n",
    '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST',
    "#EXTM3U\n#EXT-X-BYTERANGE:100@0\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST",
  ])
    await assert.rejects(
      api.prepareOfflineHls(
        { ...media, tracks: [] },
        { ...options, audioTrack: undefined },
        id,
        new AbortController().signal,
        async () => text,
        origin,
      ),
    );
  const files = fixtures();
  await assert.rejects(
    api.prepareOfflineHls(
      media,
      { ...options, audioTrack: "Telugu" },
      id,
      new AbortController().signal,
      async (url) => files.get(url),
      origin,
    ),
    /requested audio/,
  );
  for (const raw of [
    "http://127.0.0.1/private",
    "https://10.0.0.1/private",
    "https://user:password@cdn.test/file",
  ])
    assert.throws(() => api.mediaResourceUrl(raw, `${origin}/`));
});

test("download options inspect only the master and corrupt resume references are rejected", async () => {
  let requests = 0;
  const files = fixtures();
  const api = modules(
    {},
    {
      fetch: async () => {
        requests++;
        return new Response(master);
      },
    },
  )("src/lib/offline-hls.ts");
  const choices = await api.inspectHlsDownloadOptions(
    media.src,
    new AbortController().signal,
  );
  assert.equal(requests, 1);
  assert.deepEqual([...choices.heights], [480, 1080]);
  assert.deepEqual(
    choices.audioTracks.map((track) => track.name).join(","),
    "English,Japanese",
  );
  const plan = await api.prepareOfflineHls(
    media,
    options,
    id,
    new AbortController().signal,
    async (url) => files.get(url),
    origin,
  );
  assert.equal(api.validateOfflinePlan(plan, id, origin).id, id);
  const corrupt = structuredClone(plan);
  corrupt.playlists[0].text += "\nhttps://remote.test/uncached-segment.ts";
  assert.throws(
    () => api.validateOfflinePlan(corrupt, id, origin),
    /incomplete resources/,
  );
  const duplicate = structuredClone(plan);
  duplicate.resources[1].key = duplicate.resources[0].key;
  assert.throws(
    () => api.validateOfflinePlan(duplicate, id, origin),
    /incomplete resources/,
  );
});

test("a saved video has a complete local package, exact bytes, and no cross-origin preflight header", async () => {
  const h = harness();
  let completed = 0;
  h.target.addEventListener("mr:video-downloaded", () => completed++);
  assert.equal(h.engine.queueVideoDownloads(anime, [episode], options), 1);
  assert.equal(
    h.engine.queueVideoDownloads(anime, [episode], options),
    0,
    "duplicate selection is not queued twice",
  );
  await settled(h.engine);
  const state = h.engine.useVideoDownloads();
  assert.equal(state.jobs.length, 0);
  const entry = Object.values(state.saved)[0];
  assert.ok(entry);
  assert.equal(entry.actualHeight, 480);
  assert.equal(completed, 1);
  assert.equal((await h.engine.getOfflineVideo(entry.id)).id, entry.id);
  assert.ok(entry.keys.every((key) => h.entries.has(`${origin}${key}`)));
  const expectedBytes = [...h.entries]
    .filter(([key]) => key.includes("/asset-"))
    .reduce((sum, [, entry]) => sum + entry.bytes.length, 0);
  assert.equal(entry.bytes, expectedBytes);
  assert.ok(
    h.network
      .filter((request) => request.url.startsWith("https://relay.test"))
      .every((request) => !Object.keys(request.options.headers).length),
  );
  h.entries.delete(`${origin}${entry.keys[0]}`);
  await assert.rejects(h.engine.getOfflineVideo(entry.id), /files are missing/);
  await h.engine.deleteVideoDownload(entry.id);
  assert.equal(Object.keys(h.engine.useVideoDownloads().saved).length, 0);
  assert.equal(h.entries.size, 0);
});

test("full storage cannot create a phantom completed video", async () => {
  const h = harness();
  h.setFailSaved();
  assert.equal(h.engine.queueVideoDownloads(anime, [episode], options), 1);
  await settled(h.engine);
  const state = h.engine.useVideoDownloads();
  assert.equal(Object.keys(state.saved).length, 0);
  assert.equal(state.jobs[0].state, "failed");
  assert.match(state.jobs[0].error, /video index/);
  assert.equal(
    Object.keys(JSON.parse(h.index.get("mr:video-downloads")).saved).length,
    0,
  );
  const lowQuota = harness({ quota: { quota: 1000, usage: 0 } });
  lowQuota.engine.queueVideoDownloads(anime, [episode], options);
  await settled(lowQuota.engine);
  assert.match(
    lowQuota.engine.useVideoDownloads().jobs[0].error,
    /Not enough storage/,
  );
});

test("a failed asset keeps a retryable plan and cached assets without claiming completion", async () => {
  let fail = true;
  const h = harness({
    fetch: async (url) =>
      url.endsWith("second.m4s") && fail
        ? new Response("Unavailable", { status: 503 })
        : undefined,
  });
  h.engine.queueVideoDownloads(anime, [episode], options);
  await settled(h.engine);
  const job = h.engine.useVideoDownloads().jobs[0];
  assert.equal(job.state, "failed");
  assert.equal(Object.keys(h.engine.useVideoDownloads().saved).length, 0);
  const firstRequests = h.network.filter((request) =>
    request.url.endsWith("first.m4s"),
  ).length;
  fail = false;
  h.engine.resumeVideoDownload(job.id);
  await settled(h.engine);
  assert.equal(Object.keys(h.engine.useVideoDownloads().saved).length, 1);
  assert.equal(
    h.network.filter((request) => request.url.endsWith("first.m4s")).length,
    firstRequests,
    "cached complete assets are reused on retry",
  );
});

test("pause aborts workers, resume completes, and a reloaded queue starts paused", async () => {
  let blocked = true,
    blocking = false;
  const h = harness({
    fetch: async (url, options) => {
      if (!url.endsWith("second.m4s") || !blocked) return;
      blocking = true;
      return new Promise((_, reject) =>
        options.signal.addEventListener(
          "abort",
          () => reject(options.signal.reason),
          { once: true },
        ),
      );
    },
  });
  h.engine.queueVideoDownloads(anime, [episode], options);
  await until(() => blocking);
  const job = h.engine.useVideoDownloads().jobs[0];
  h.engine.pauseVideoDownload(job.id);
  await tick();
  await tick();
  assert.equal(h.engine.useVideoDownloads().jobs[0].state, "paused");
  assert.equal(Object.keys(h.engine.useVideoDownloads().saved).length, 0);
  const restored = modules(h.mocks, h.globals)("src/lib/video-downloads.ts");
  assert.equal(restored.useVideoDownloads().jobs[0].state, "paused");
  blocked = false;
  h.engine.resumeVideoDownload(job.id);
  await settled(h.engine);
  assert.equal(Object.keys(h.engine.useVideoDownloads().saved).length, 1);
});

test("active playback yields new download network requests until playback releases the connection", async () => {
  const h = harness();
  h.engine.useVideoDownloads();
  h.target.dispatchEvent(
    new CustomEvent("mr:playback-active", { detail: true }),
  );
  h.engine.queueVideoDownloads(anime, [episode], options);
  await tick();
  await tick();
  assert.equal(h.network.length, 0);
  assert.equal(h.engine.useVideoDownloads().jobs[0].waitingForPlayback, true);
  h.target.dispatchEvent(
    new CustomEvent("mr:playback-active", { detail: false }),
  );
  await settled(h.engine);
  assert.equal(Object.keys(h.engine.useVideoDownloads().saved).length, 1);
});

test("cancel removes the durable job and incomplete package without publishing completion", async () => {
  const h = harness();
  h.engine.useVideoDownloads();
  h.target.dispatchEvent(
    new CustomEvent("mr:playback-active", { detail: true }),
  );
  h.engine.queueVideoDownloads(anime, [episode], options);
  const job = h.engine.useVideoDownloads().jobs[0];
  await tick();
  h.engine.cancelVideoDownload(job.id);
  await tick();
  await tick();
  assert.equal(h.engine.useVideoDownloads().jobs.length, 0);
  assert.equal(Object.keys(h.engine.useVideoDownloads().saved).length, 0);
  assert.equal(h.entries.size, 0);
  assert.equal(JSON.parse(h.index.get("mr:video-downloads")).jobs.length, 0);
});
