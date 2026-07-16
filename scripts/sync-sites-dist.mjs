import { cp, readFile, rm, writeFile } from "node:fs/promises";

const serverWranglerConfig = "apps/web/dist/server/wrangler.json";
const wranglerConfig = JSON.parse(await readFile(serverWranglerConfig, "utf8"));
wranglerConfig.no_bundle = false;
await writeFile(serverWranglerConfig, `${JSON.stringify(wranglerConfig)}\n`);

await rm("dist", { recursive: true, force: true });
await cp("apps/web/dist", "dist", { recursive: true });

const rootWranglerConfig = {
  ...wranglerConfig,
  main: "server/index.js",
  assets: { ...wranglerConfig.assets, directory: "client" },
};
await writeFile("dist/wrangler.json", `${JSON.stringify(rootWranglerConfig)}\n`);
