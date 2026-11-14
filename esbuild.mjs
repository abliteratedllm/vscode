// Bundles the extension into dist/extension.js. `--production` minifies and drops the source map;
// `--watch` rebuilds on change.
import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  outfile: "dist/extension.js",
  external: ["vscode"],
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: "info",
};

if (watch) {
  await (await esbuild.context(options)).watch();
} else {
  await esbuild.build(options);
}
