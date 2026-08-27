import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["./lib/index.ts"],
    format: ["esm", "cjs"],
    shims: true,
    dts: true,
  },
  {
    entry: ["./lib/handler.ts"],
    format: ["cjs"],
    dts: false,
    sourcemap: true,
    clean: false,
  },
]);
