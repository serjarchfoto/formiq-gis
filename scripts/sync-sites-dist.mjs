import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const serverWranglerConfig = "apps/web/dist/server/wrangler.json";
const wranglerConfig = JSON.parse(await readFile(serverWranglerConfig, "utf8"));
wranglerConfig.no_bundle = false;
await writeFile(serverWranglerConfig, `${JSON.stringify(wranglerConfig)}\n`);

await rm("dist", { recursive: true, force: true });
await cp("apps/web/dist", "dist", { recursive: true });

// Server functions in the Sites/Vercel artifact run from a packaged runtime
// directory, so files that are present in the repository are not guaranteed
// to be available through `process.cwd()`. Keep the small, public Microsoft
// quadkey index in both the server artifact and the static asset tree. Do not
// copy the whole data directory: it may contain local credentials or private
// datasets.
const microsoftIndex = "apps/web/data/microsoft-buildings/dataset-links.csv";
const artifactIndex = "apps/web/dist/data/microsoft-buildings/dataset-links.csv";
const clientIndex = "apps/web/dist/client/data/microsoft-buildings/dataset-links.csv";

await mkdir(path.dirname(artifactIndex), { recursive: true });
await mkdir(path.dirname(clientIndex), { recursive: true });
await cp(microsoftIndex, artifactIndex);
await cp(microsoftIndex, clientIndex);

await mkdir(path.dirname("dist/data/microsoft-buildings/dataset-links.csv"), { recursive: true });
await cp(artifactIndex, "dist/data/microsoft-buildings/dataset-links.csv");
await mkdir(path.dirname("dist/client/data/microsoft-buildings/dataset-links.csv"), { recursive: true });
await cp(clientIndex, "dist/client/data/microsoft-buildings/dataset-links.csv");

const rootWranglerConfig = {
  ...wranglerConfig,
  main: "server/index.js",
  assets: { ...wranglerConfig.assets, directory: "client" },
};
await writeFile("dist/wrangler.json", `${JSON.stringify(rootWranglerConfig)}\n`);
