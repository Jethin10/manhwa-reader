import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

// Exercise the actual TypeScript modules without adding a runtime test dependency.
const storage = new Map(),
  modules = new Map();
const localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
const window = new EventTarget();
function load(file) {
  const path = resolve(file);
  if (modules.has(path)) return modules.get(path).exports;
  const compiledModule = { exports: {} };
  modules.set(path, compiledModule);
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = createContext({
    module: compiledModule,
    exports: compiledModule.exports,
    localStorage,
    window,
    Event,
    Blob,
    URL,
    URLSearchParams,
    console,
    setTimeout,
    require: (name) => {
      if (name === "react") return { useSyncExternalStore: () => null };
      if (name === "./toast") return { toast() {} };
      if (name === "./library") return { normalizeReader: (v) => v };
      if (name === "./preferences") return { normalizePreferences: (v) => v };
      return load(resolve(dirname(path), `${name}.ts`));
    },
  });
  runInContext(source, context, { filename: path });
  return compiledModule.exports;
}
const types = load("src/lib/movie-types.ts");
const providers = load("src/lib/movie-providers.ts");
const library = load("src/lib/movie-library.ts");
const backup = load("src/lib/backup.ts");
const movie = {
  id: "tt8178634",
  tmdbId: "579974",
  title: "RRR",
  poster: "https://images.metahub.space/poster/small/tt8178634/img",
  year: "2022",
};
const cine = providers.MOVIE_PROVIDERS.find((p) => p.id === "cinesrc");
const vidlink = providers.MOVIE_PROVIDERS.find((p) => p.id === "vidlink");
const vidsrc = providers.MOVIE_PROVIDERS.find((p) => p.id === "vidsrc-sh");
assert.equal(
  types.isMovieId([movie.id]),
  false,
  "IDs must be strings, never coerced arrays",
);
assert.equal(
  providers.decodeMovieEvent(
    vidsrc,
    { type: "PLAYER_EVENT", data: { player_status: "loading" } },
    movie,
  ),
  null,
);
assert.equal(
  providers.decodeMovieEvent(cine, { type: "cinesrc:timeupdate" }, movie),
  null,
);
assert.equal(
  providers.decodeMovieEvent(
    cine,
    { type: "cinesrc:timeupdate", currentTime: NaN },
    movie,
  ),
  null,
);
assert.equal(
  providers.decodeMovieEvent(
    cine,
    { type: "cinesrc:timeupdate", currentTime: 900, duration: 60 },
    movie,
  ),
  null,
);
assert.equal(
  providers.decodeMovieEvent(
    vidlink,
    { type: "PLAYER_EVENT", data: { event: "play", tmdbId: "wrong" } },
    movie,
  ),
  null,
);
assert.equal(
  providers.decodeMovieEvent(
    cine,
    { type: "cinesrc:timeupdate", currentTime: 30, duration: 100 },
    movie,
  )?.time,
  30,
);
assert.equal(
  providers
    .availableProviders({ ...movie, tmdbId: undefined }, [], "auto")
    .some((p) => p.requiresTmdb),
  false,
);
assert.equal(
  providers.availableProviders(
    movie,
    providers.MOVIE_PROVIDERS.map((p) => p.id),
    "auto",
  ).length,
  0,
);
const prefs = {
  ...library.DEFAULT_MOVIE_PREFERENCES,
  quality: "2160",
  timeout: 45,
  isolatePlayer: true,
};
const options = { ...prefs, startAt: 65 };
for (const p of providers.MOVIE_PROVIDERS) {
  const url = new URL(p.url(movie, options));
  assert.equal(url.origin, p.origin, `${p.id} must stay on its fixed origin`);
  assert.equal(url.protocol, "https:");
}
assert.equal(
  new URL(cine.url(movie, options)).searchParams.get("quality"),
  "2160",
);
assert.equal(
  library.normalizeMovieHistory([{ ...movie, id: [movie.id] }]).length,
  0,
);
library.getMoviePreferences();
backup.importBackup(
  JSON.stringify({
    app: "Manhwa",
    version: 1,
    storage: { "mr:movie-preferences": prefs },
  }),
);
assert.equal(
  library.getMoviePreferences().timeout,
  45,
  "Import invalidates unmounted caches",
);
const old = Array.from({ length: 100 }, (_, i) => ({
  id: `tt${10000 + i}`,
  title: `Movie ${i}`,
  poster: "",
  year: "",
  provider: "cinesrc",
  time: 20,
  duration: 100,
  completed: false,
  at: 1000 - i,
}));
storage.set("mr:movie-history", JSON.stringify(old));
library.resetMovieStorageCache();
backup.importBackup(
  JSON.stringify({
    app: "Manhwa",
    version: 1,
    storage: {
      "mr:movie-history": [{ ...old[0], id: "tt99999", at: 2000 }],
      "mr:collection": [
        {
          id: movie.id,
          title: movie.title,
          cover: movie.poster,
          type: "Movie",
          media: "movie",
          status: "planned",
          updatedAt: 2000,
        },
      ],
    },
  }),
);
const merged = library.getMovieHistory();
assert.equal(merged.length, 100);
assert.equal(merged[0].id, "tt99999");
assert(
  merged.some((m) => m.id === "tt10000"),
  "Keep most recent existing movie",
);
assert(!merged.some((m) => m.id === "tt10099"), "Drop oldest movie first");
const exported = JSON.parse(backup.exportBackup());
assert.equal(exported.storage["mr:collection"][0].media, "movie");
assert.equal(exported.storage["mr:movie-preferences"].quality, "2160");
assert.equal(exported.storage["mr:movie-preferences"].isolatePlayer, true);
assert.equal(exported.storage["mr:movie-history"].length, 100);
const before = localStorage.getItem("mr:movie-history");
assert.throws(() =>
  backup.importBackup(
    JSON.stringify({
      app: "Manhwa",
      version: 1,
      storage: { "mr:movie-history": [{ ...old[0], id: [movie.id] }] },
    }),
  ),
);
assert.equal(
  localStorage.getItem("mr:movie-history"),
  before,
  "Invalid import leaves stored data intact",
);
console.log(
  "Movie checks passed: event validation, fixed origins, provider filtering, preferences, backup merge and roundtrip.",
);
