


import { build } from "esbuild";

await build({
  entryPoints: [new URL("./quote-sync.ts", import.meta.url).pathname],
  outfile: new URL("./dist/index.mjs", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "warning",
});
