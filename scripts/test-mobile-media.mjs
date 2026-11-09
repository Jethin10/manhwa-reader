import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const compiled = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    source,
    {
      module: compiled,
      exports: compiled.exports,
      require: (id) => (id in mocks ? mocks[id] : require(id)),
      console,
      Buffer,
      URL,
      Request,
      Response,
      Headers,
      AbortController,
      AbortSignal,
      DOMException,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      ...globals,
    },
    { filename: file },
  );
  return compiled.exports;
}
const drain = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

test("an old failed media request cannot evict its replacement", async () => {
  let rejectOld;
  let requests = 0;
  const client = load(
    "src/lib/anime-client.ts",
    {},
    {
      fetch: () => {
        requests++;
        if (requests === 1)
          return new Promise((_, reject) => {
            rejectOld = reject;
          });
        return new Promise(() => {});
      },
    },
  );
  const old = client.loadMedia("episode", "sub").catch(() => {});
  client.clearPlaybackCache();
  void client.loadMedia("episode", "sub");
  rejectOld(new Error("Old request failed"));
  await old;
  void client.loadMedia("episode", "sub");
  assert.equal(requests, 2, "replacement request must remain shared");
});

test("a playable source returns without waiting for delivery probes", async () => {
  const data = Buffer.from(
    JSON.stringify({ src: "https://zokoanime.video/master.m3u8" }),
  );
  const key = Buffer.from("otaku-embed-v1");
  for (let i = 0; i < data.length; i++) data[i] ^= key[i % key.length];
  let release;
  let fetches = 0;
  const media = load(
    "src/lib/anime-media.ts",
    {
      "server-only": {},
      "next/cache": { cacheLife() {} },
      "./anime": {
        getAnimeServers: async () => [
          { language: "sub", url: "https://zokoanime.video/player" },
        ],
      },
      "./source-http": {
        sourceFetch: async () =>
          new Response(`window.__P="${data.toString("base64")}"`),
      },
      "./image-signing": {
        imageSignature: () => "test",
        validImageSignature: () => true,
      },
      "./relay": { relayEnabled: () => false },
    },
    {
      fetch: () => {
        fetches++;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    },
  );
  const result = media.getAnimeMedia("1", "sub");
  const quick = await Promise.race([
    result.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 30)),
  ]);
  release?.(new Response("#EXTM3U\n#EXT-X-ENDLIST"));
  await result;
  assert.equal(quick, true);
  assert.equal(fetches, 0, "CDN probes must not delay resolving the source");
});

test("pausing a media consumer releases it immediately without duplicating shared requests", async () => {
  let requests = 0;
  const client = load(
    "src/lib/anime-client.ts",
    {},
    {
      fetch: () => {
        requests++;
        return new Promise(() => {});
      },
    },
  );
  const controller = new AbortController();
  const waiting = client.loadMedia("episode", "sub", controller.signal).then(
    () => false,
    () => true,
  );
  controller.abort();
  const cancelled = await Promise.race([
    waiting,
    new Promise((resolve) => setTimeout(() => resolve(false), 20)),
  ]);
  void client.loadMedia("episode", "sub");
  assert.equal(cancelled, true);
  assert.equal(requests, 1);
  client.clearPlaybackCache();
});

test("the actual video engine uses measured, cancellable HLS loading without speculative segment requests", async () => {
  const effects = [];
  const configs = [];
  let nullRefs = 0;
  const video = {
    playbackRate: 1,
    currentTime: 0,
    duration: 0,
    addEventListener() {},
    removeEventListener() {},
    canPlayType: () => "",
    removeAttribute() {},
    load() {},
    buffered: { length: 0 },
    textTracks: Object.assign([], {
      addEventListener() {},
      removeEventListener() {},
    }),
  };
  class Hls {
    static isSupported = () => true;
    static Events = {};
    constructor(config) {
      this.config = config;
      configs.push(config);
    }
    on() {}
    loadSource() {}
    attachMedia() {}
    destroy() {}
  }
  const player = load(
    "src/components/AdaptiveVideo.tsx",
    {
      react: {
        useRef: (value) => ({
          current: value === null && ++nullRefs === 1 ? video : value,
        }),
        useState: (value) => [
          typeof value === "function" ? value() : value,
          () => {},
        ],
        useEffect: (effect) => effects.push(effect),
        useCallback: (callback) => callback,
      },
      "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
      "@/lib/preferences": {
        usePreferences: () => ({ speed: 1, buffer: "balanced" }),
      },
      "@/lib/playback-policy": { saveDataEnabled: () => false },
      "./MediaSheet": { MediaSheet: () => null },
      "@/lib/hls-prefetch": { prefetchingLoader: () => class {} },
      "hls.js": { __esModule: true, default: Hls },
    },
    {
      navigator: {
        userAgent: "Android Chrome",
        connection: { saveData: false },
      },
      localStorage: { getItem: () => null },
      window: {
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        setInterval: () => 0,
      },
      CustomEvent: class {},
      document: { addEventListener() {}, removeEventListener() {} },
    },
  );
  player.default({
    media: { src: "/video.m3u8", servers: [], tracks: [] },
    title: "Test",
    onError() {},
    onProgress() {},
    onEnded() {},
  });
  const cleanups = effects.map((effect) => effect());
  await drain();
  cleanups.forEach((cleanup) => cleanup?.());
  assert.equal(configs.length, 1);
  assert.equal(
    configs[0].fLoader,
    undefined,
    "hls.js must own requests and bandwidth measurement",
  );
  assert.equal(
    configs[0].abrEwmaDefaultEstimate,
    undefined,
    "do not assume a 6Mbps connection before measuring it",
  );
});

test("the service worker serves complete and ranged saved media without falling back to network", async () => {
  let handle;
  let network = 0;
  load(
    "public/sw.js",
    {},
    {
      self: {
        location: { origin: "https://app.test" },
        addEventListener: (type, callback) => {
          if (type === "fetch") handle = callback;
        },
      },
      caches: {
        open: async () => ({
          match: async (request) =>
            request.url.includes("missing")
              ? undefined
              : new Response("abcdef"),
        }),
      },
      fetch: () => {
        network++;
        throw new Error("Offline");
      },
    },
  );
  async function request(range, missing = false) {
    let response;
    handle({
      request: new Request(
        `https://app.test/offline-media/fixture/${missing ? "missing" : "segment"}`,
        { headers: range ? { Range: range } : {} },
      ),
      respondWith: (result) => {
        response = result;
      },
    });
    return response;
  }
  assert.equal(await (await request()).text(), "abcdef");
  const ranged = await request("bytes=2-4");
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get("content-range"), "bytes 2-4/6");
  assert.equal(await ranged.text(), "cde");
  assert.equal(await (await request("bytes=-2")).text(), "ef");
  assert.equal((await request("bytes=9-")).status, 416);
  assert.equal((await request(undefined, true)).status, 404);
  assert.equal(network, 0);
});

test("chapter queues restore paused and can pause an in-flight request", async () => {
  let requests = 0;
  const client = load(
    "src/lib/downloads.ts",
    {
      react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
      "./toast": { toast() {} },
    },
    {
      localStorage: {
        getItem: (key) =>
          key === "mr:download-queue"
            ? JSON.stringify([
                {
                  id: "chapter",
                  number: "1",
                  title: null,
                  series: { id: "series", title: "QA" },
                  state: "queued",
                },
              ])
            : null,
        setItem() {},
      },
      window: { addEventListener() {}, removeEventListener() {} },
      navigator: { storage: {} },
      caches: { open: async () => ({ delete: async () => true }) },
      fetch: (_url, options) => {
        requests++;
        return new Promise((_, reject) =>
          options.signal.addEventListener(
            "abort",
            () => reject(options.signal.reason),
            { once: true },
          ),
        );
      },
    },
  );
  assert.equal(client.useDownloads().jobs[0].state, "paused");
  assert.equal(requests, 0);
  client.resumeDownload("chapter");
  assert.equal(requests, 1);
  client.pauseDownload("chapter");
  await drain();
  assert.equal(client.useDownloads().jobs[0].state, "paused");
  assert.equal(Object.keys(client.useDownloads().saved).length, 0);
});
