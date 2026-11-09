# Movie provider research

Checked 2026-11-09. Scope: free or unofficial movie sources, especially Indian and Telugu films, and evidence of integration options. This is a research inventory, not a working-provider certification. No provider code was installed or executed and no movie playback was tested.

## Findings

The strongest new Telugu leads are MalluMV, AllMovieLand, MovieBox, MovieBlast, CinemaCity, Castle and Einthusan. Their evidence is primarily community-maintained language metadata. VidSrc.pk also advertises Telugu in its linked promotional channel, but a documented discovery endpoint failed the direct check below.

A language tag does not establish the number of available films, original Telugu audio, current stream availability, or price. Manifest `enabled: true` means the maintainer enables that module, not that playback passed our tests. These community plugins are adapters for another application, not drop-in SDKs for this app.

## Telugu-specific leads

| Name | Evidence | Qualification |
| --- | --- | --- |
| MalluMV | Yoru manifest tags Telugu, Tamil, Hindi, Malayalam and Kannada; lists MP4/MKV | Movie provider; playback untested |
| CinemaCity | Yoru tags Telugu and Tamil, alongside Hindi and other languages | Hindi-Nuvio omits Telugu, so manifests disagree |
| Castle | Yoru tags Telugu, Tamil, Malayalam, Kannada, Hindi and English | CB manifest only tags English/Hindi |

Source: [Yoru manifest](https://raw.githubusercontent.com/yoruix/nuvio-providers/refs/heads/main/manifest.json). Format listings are maintainer claims, not inspected streams.

| Name | Evidence | Qualification |
| --- | --- | --- |
| AllMovieLand | Hindi-Nuvio tags English, Hindi, Tamil, Telugu; lists HLS | Adapter available; no public provider API established |
| MovieBox | Same manifest explicitly tags Telugu and Tamil | Another repository tags only English |
| MovieBlast | Same manifest tags Telugu and Tamil; lists MP4/MKV/HLS | Coverage and price not verified |

Source: [Hindi-Nuvio manifest](https://raw.githubusercontent.com/D3adlyRocket/Hindi-Nuvio/refs/heads/main/manifest.json).

Einthusan exposes a Telugu category on its own site. It claims licensed content; that claim was not independently verified, so it is not classified here as a confirmed piracy service. A community adapter also lists Telugu. No public third-party playback API or redistribution permission was established. [Site](https://einthusan.tv/intro/), [community repository](https://github.com/SA7ANI/cb-providers).

## More Indian/Hindi leads

Hindi-Nuvio additionally lists **FlixIndia, HindMoviez, HDMovie2, CineStream, MoviesDrive, Movies4u, Streamflix, VegaMovies and NetMirror**. Its NetMirror metadata is not evidence of NetMirror's complete catalog or underlying infrastructure. [Manifest](https://raw.githubusercontent.com/D3adlyRocket/Hindi-Nuvio/refs/heads/main/manifest.json).

CB Providers additionally lists **DesiFlix, RedFlix, MultiMovies, HDHub4u, 4KHDHub and MoviesMod**. Its README and manifest differ on some languages, notably Castle and RedFlix. Do not turn broad README claims about Telugu or 4K into per-provider guarantees. [README](https://github.com/SA7ANI/cb-providers), [manifest](https://raw.githubusercontent.com/SA7ANI/cb-providers/main/manifest.json).

## Providers with published embed documentation

| Provider | Published offering | Indian/Telugu evidence |
| --- | --- | --- |
| VidSrc.pk | Free/keyless embeds, language metadata and provider discovery | Linked promotional channel explicitly mentions Telugu and focuses on Hindi dubbed content |
| Viduki | Free movie/TV embeds, ads, fallback events | Multilingual option advertised; Telugu catalog unverified |
| AnyPlay | Unauthenticated catalog/server API and embeds | No specific Telugu coverage established |
| CineSrc | TMDB embeds and player events | Telugu coverage unverified; documentation mentions premium source access |
| VidLink | Movie/TV/anime embeds and progress events | Telugu coverage unverified |
| AutoEmbed | Claims free access without signup/key | Telugu coverage unverified |
| EmbedWave | Claims free embeds without injected ads | Telugu coverage unverified |
| SuperEmbed | Free ad-supported multi-host embeds | Telugu coverage unverified |

Sources: [VidSrc.pk](https://vidsrc.pk/), [linked channel](https://t.me/s/vidsrc_api), [Viduki](https://www.viduki.net/), [AnyPlay](https://anyplay.stream/api), [CineSrc](https://cinesrc.st/docs), [VidLink](https://vidlink.pro/), [AutoEmbed](https://autoembed.me/), [EmbedWave](https://embedwave.cc/), [SuperEmbed](https://superembed.stream/).

Viduki describes its 4K AI option as client-side upscaling of mostly 1080p streams. This does not establish native 4K video. Audio presets or virtual surround also do not establish discrete source surround tracks.

## Direct checks from this machine

| Documented endpoint | Observed result | Interpretation |
| --- | --- | --- |
| `https://embed.vidsrc.pk/__stream/providers` | HTTP 404 through PowerShell | Documentation does not establish this endpoint currently works |
| `https://api.anyplay.stream/v1/servers` | HTTP 403 through Python urllib | Access denied from this client; cannot conclude global outage |

No bypasses were attempted. No playable-title counts or audio/quality results were produced. Historical promotional examples for VidSrc.pk also differ from current website TV route documentation; current documentation still needs runtime validation.

## Research priorities

For original Telugu audio, investigate the explicit Telugu-tagged leads first. For Hindi coverage, investigate the Hindi-focused adapters separately. For simple embedded playback, evaluate the documented providers without assuming their catalog matches their metadata listings.

Before calling a provider supported, check representative older and newer Telugu films, actual audio tracks, correct title/year matching, native resolution, seek/resume, Android compatibility, ads and failure handling. Record results per title. An HTTP success, movie poster, enabled plugin or 4K label alone is insufficient.

No provider was added to the app. No source here establishes complete NetMirror parity, reliable free downloads, or permission to distribute movies.
