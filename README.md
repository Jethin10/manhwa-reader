# Kairo

i built this because i was tired of jumping between five sites to read one manhwa and then another site to watch anime. so now it's all in one app, manhwa manga anime and movies, and it picks the best copy of a chapter from whichever source has it.

it's live at https://kairo-reader.vercel.app and you can just open that on your phone. on iphone use safari and add it to your home screen. on android grab the app here [kairo apk](https://github.com/Jethin10/manhwa-reader/releases/latest/download/manhwa.apk), it tells you when there's an update so you don't have to keep checking.

the thing i use the most is downloads. you can save chapters and anime episodes and they keep going even if you close the app or lose signal for a bit, they just pick up again. in the android app you can download movies too, you start the movie and hit download and it saves the copy that's playing so you can watch it on a flight or whatever. it also tries hard to skip those cam recordings from the cinema, if a real copy is out it goes for that first and there's a button to report a source if it still looks like someone filmed it on a phone.

reading works like mihon if you've used that. long strip for manhwa, right to left for manga, it remembers where you stopped and marks stuff read. anime plays in its own player with quality options and auto next episode.

if you want to run it yourself it's a normal next.js app

```powershell
npm install
npm run build
npm start -- -p 3123
```

for your phone on the same wifi run `npm run start:lan` and open the address it prints. the android app is in `android/`, it needs jdk 21 and the android sdk, `npm run mobile:apk` builds it. pushing to main builds and releases a new signed apk on its own.

i host it on vercel in the mumbai region since that's closest to me, with a small cloudflare worker in `relay/` for video. there's more detail on how the movies, offline video and the rest work in `docs/` if you want to dig in.

everything you save lives on your device, there's no account. sources change their sites sometimes so a source can break for a while, the others still work when that happens.
