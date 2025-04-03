import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const monorepoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const BABEL_SRC_REGEXP =
  path.sep === "/"
    ? /packages\/(babel-[^/]+)\/src\//
    : /packages\\(babel-[^\\]+)\\src\\/;

export default function () {
  return {
    name: "babel-source",
    load(id) {
      return null;
    },
    resolveId(importee) {
      return null;
    },
  };
}
