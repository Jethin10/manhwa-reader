// Serves the production build on every interface and prints the address to type into the phone app.
import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

const port = process.env.PORT ?? "3000";
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => `http://${n.address}:${port}`);
console.log("\nOpen the Manhwa app and connect to:");
for (const a of addresses) console.log(`  ${a}`);
console.log("");
spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit", shell: true });
