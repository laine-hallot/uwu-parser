import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { babel as rollupBabel } from "@rollup/plugin-babel";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      plugins: [
        rollupBabel({
          envName: "rollup",
          babelHelpers: "bundled",
          configFile: "./babel.config.mjs",
          extensions: [".ts", ".js", ".mjs", ".cjs"],
        }),
      ],
    },
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "babel/helper-string-parser",
      fileName: "index",
      formats: ["cjs"],
    },
  },
});
