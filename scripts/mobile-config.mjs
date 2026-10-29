// Bakes an optional default server address into the native connect screen.
import { writeFileSync } from "node:fs";

const url = process.env.MANHWA_SERVER_URL ?? "";
writeFileSync(
  new URL("../mobile/www/config.js", import.meta.url),
  `// Optional default server, written by \`npm run mobile:sync\` from MANHWA_SERVER_URL.\nwindow.MANHWA_SERVER = ${JSON.stringify(url)};\n`,
);
console.log(url ? `Default server: ${url}` : "No default server; the app will ask on first launch.");
