// Renders scripts/icon.svg into the PWA, Apple and Android launcher sizes.
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const svg = readFileSync(new URL("./icon.svg", import.meta.url));
const out = async (file, size, { padding = 0, round = false } = {}) => {
  mkdirSync(dirname(file), { recursive: true });
  const inner = Math.round(size * (1 - padding * 2));
  let img = sharp(svg, { density: 512 }).resize(inner, inner);
  if (round) {
    const mask = Buffer.from(`<svg width="${inner}" height="${inner}"><circle cx="${inner / 2}" cy="${inner / 2}" r="${inner / 2}"/></svg>`);
    img = img.composite([{ input: mask, blend: "dest-in" }]);
  }
  const buf = await img.png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: padding ? "#0b0b0c" : { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: buf, gravity: "center" }])
    .png()
    .toFile(file);
};

await out("public/icons/icon-192.png", 192);
await out("public/icons/icon-512.png", 512);
await out("public/icons/apple-touch-icon.png", 180);
await out("public/icons/icon-maskable-512.png", 512, { padding: 0.1 });
await out("src/app/icon.png", 512);

// Android launcher icons, used when the native shell exists.
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const res = "android/app/src/main/res";
if (existsSync(res)) {
  for (const [d, size] of Object.entries(densities)) {
    await out(`${res}/mipmap-${d}/ic_launcher.png`, size);
    await out(`${res}/mipmap-${d}/ic_launcher_round.png`, size, { round: true });
    await out(`${res}/mipmap-${d}/ic_launcher_foreground.png`, Math.round(size * 2.25), { padding: 0.2 });
  }
}
// Native splash screens: black, icon centered, same sizes as the platform template.
import { readdirSync } from "node:fs";
if (existsSync(res)) {
  for (const dir of readdirSync(res).filter((d) => d.startsWith("drawable"))) {
    const file = `${res}/${dir}/splash.png`;
    if (!existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    const size = Math.round(Math.min(width, height) * 0.28);
    const icon = await sharp(svg, { density: 512 })
      .resize(size, size)
      .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.225}"/></svg>`), blend: "dest-in" }])
      .png()
      .toBuffer();
    const out = await sharp({ create: { width, height, channels: 3, background: "#000000" } })
      .composite([{ input: icon, gravity: "center" }])
      .png()
      .toBuffer();
    writeFileSync(file, out);
  }
}
console.log("icons written");
