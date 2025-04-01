import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { babel } from "@rollup/plugin-babel";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      plugins: [babel({ babelHelpers: "bundled" })],
      external: ["@babel/helper-validator-identifier"],
    },
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "uwu-parser",
      fileName: "index",
      formats: ["es"],
    },
  },
});
