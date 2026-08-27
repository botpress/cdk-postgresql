import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["./lib/index.ts"],
    format: ["esm", "cjs"],
    shims: true,
    dts: true,
  },
  // The lambda is shipped as a ready-to-deploy asset, so that consumers never
  // need esbuild (or Docker) to synthesize a stack. Everything it needs at
  // runtime has to be inside the bundle:
  {
    entry: { index: "./lib/handler.ts" },
    outDir: "dist/lambda",
    format: ["cjs"],
    platform: "node",
    deps: { alwaysBundle: ["pg", "verror", "@aws-sdk/client-secrets-manager"] },
    dts: false,
    clean: false,
  },
]);
