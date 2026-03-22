import * as esbuild from "esbuild";
import path from "path";

await esbuild.build({
  entryPoints: ["src/backend/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/backend/index.js",
  alias: {
    "@shared": path.resolve("src/shared"),
    "@backend": path.resolve("src/backend"),
  },
  packages: "external",
  sourcemap: true,
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

console.log("Backend built successfully");
