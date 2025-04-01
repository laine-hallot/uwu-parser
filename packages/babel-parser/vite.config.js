import {
  babel as rollupBabel,
  getBabelOutputPlugin,
} from "@rollup/plugin-babel";
import { babel } from "@rollup/plugin-babel";
import { cpus } from "node:os";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Glob } from "glob";
import { log } from "../../scripts/utils/logger.cjs";
import { USE_ESM, commonJS } from "$repo-utils";
import { Worker as JestWorker } from "jest-worker";
import colors from "picocolors";
import formatCode from "../../scripts/utils/formatCode.js";
import fs from "node:fs";
import path from "node:path";
import rollupBabelSource from "../../scripts/rollup-plugin-babel-source.js";
import rollupCommonJs from "@rollup/plugin-commonjs";
import rollupDependencyCondition from "../../scripts/rollup-plugin-dependency-condition.js";
import rollupJson from "@rollup/plugin-json";
import rollupNodeResolve from "@rollup/plugin-node-resolve";
import rollupPolyfillNode from "rollup-plugin-polyfill-node";
import rollupReplace from "@rollup/plugin-replace";
import rollupStandaloneInternals from "../../scripts/rollup-plugin-standalone-internals.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { require, __dirname: monorepoRoot } = commonJS(import.meta.url);

const defaultPackagesGlob = "./@(codemods|packages|eslint)/*";
const defaultSourcesGlob = [
  `${defaultPackagesGlob}/src/**/{*.js,*.cjs,!(*.d).ts,!(*.d).cts}`,
  "!../../packages/babel-helpers/src/helpers/*",
];

const babelStandalonePluginConfigGlob =
  "../../packages/babel-standalone/scripts/pluginConfig.json";

const buildTypingsWatchGlob = [
  "../../packages/babel-types/lib/definitions/**/*.js",
  "../../packages/babel-types/scripts/generators/*.js",
];

// env vars from the cli are always strings, so !!ENV_VAR returns true for "false"
function bool(value) {
  return Boolean(value) && value !== "false" && value !== "0";
}

/**
 * map source code path to the generated artifacts path
 * @example
 * mapSrcToLib("packages/babel-core/src/index.js")
 * // returns "packages/babel-core/lib/index.js"
 * @example
 * mapSrcToLib("packages/babel-template/src/index.ts")
 * // returns "packages/babel-template/lib/index.js"
 * @example
 * mapSrcToLib("packages/babel-template/src/index.d.ts")
 * // returns "packages/babel-template/lib/index.d.ts"
 * @param {string} srcPath
 * @returns {string}
 */
function mapSrcToLib(srcPath) {
  const parts = srcPath
    .replace(/(?<!\.d)\.ts$/, ".js")
    .replace(/(?<!\.d)\.cts$/, ".cjs")
    .split("/");
  parts[2] = "lib";
  return parts.join("/");
}

function mapToDts(packageName) {
  return packageName.replace(
    /(?<=\\|\/|^)(packages|eslint|codemods)(?=\\|\/)/,
    "dts/$1"
  );
}

function getIndexFromPackage(name) {
  try {
    fs.statSync(`./${name}/src/index.ts`);
    return `${name}/src/index.ts`;
  } catch {
    return `${name}/src/index.js`;
  }
}

/**
 * @param {string} generator
 * @param {string} pkg
 * @param {string} filename
 * @param {string} message
 */
async function generateHelpers(generator, dest, filename, message) {
  const { default: generateCode } = await import(generator);
  const result = await formatCode(
    await generateCode(filename),
    path.join(dest, filename)
  );
  fs.writeFileSync(path.join(dest, filename), result, { mode: 0o644 });
  log(`${colors.green("✔")} Generated ${message}`);
}

/**
 *
 * @typedef {("asserts" | "builders" | "constants" | "validators")} TypesHelperKind
 * @param {TypesHelperKind} helperKind
 * @param {string} filename
 */
async function generateTypeHelpers(helperKind, filename = "index.ts") {
  return generateHelpers(
    `../../packages/babel-types/scripts/generators/${helperKind}.js`,
    `../../packages/babel-types/src/${helperKind}/generated/`,
    filename,
    `@babel/types -> ${helperKind}`
  );
}

function createWorker(useWorker) {
  const numWorkers = Math.ceil(Math.max(cpus().length, 1) / 2) - 1;
  if (
    numWorkers === 0 ||
    !useWorker ||
    // For some reason, on CircleCI the workers hang indefinitely.
    process.env.CIRCLECI
  ) {
    return require("./babel-worker.cjs");
  }
  const worker = new JestWorker(require.resolve("./babel-worker.cjs"), {
    enableWorkerThreads: true,
    numWorkers,
    exposedMethods: ["transform"],
  });
  worker.getStdout().pipe(process.stdout);
  worker.getStderr().pipe(process.stderr);
  return worker;
}

async function buildBabel(useWorker, ignore = []) {
  const worker = createWorker(useWorker);
  const files = new Glob(defaultSourcesGlob, {
    ignore: ignore.map(p => `${p.src}/**`),
    posix: true,
  });

  const promises = [];
  for await (const file of files) {
    // @example ./packages/babel-parser/src/index.js
    const dest = "./" + mapSrcToLib(file);
    promises.push(
      worker.transform(file, dest, {
        sourceMaps: !file.endsWith(".d.ts"),
      })
    );
  }
  return Promise.allSettled(promises)
    .then(results => {
      results.forEach(result => {
        if (result.status === "rejected") {
          if (process.env.WATCH_SKIP_BUILD) {
            console.error(result.reason);
          } else {
            throw result.reason;
          }
        }
      });
    })
    .finally(() => {
      worker.end?.();
    });
}

/**
 * Resolve a nested dependency starting from the given file
 */
function resolveChain(baseUrl, ...packages) {
  const require = createRequire(baseUrl);

  return packages.reduce(
    (base, pkg) =>
      path.dirname(require.resolve(pkg + "/package.json", { paths: [base] })),
    path.dirname(fileURLToPath(baseUrl))
  );
}

// If this build is part of a pull request, include the pull request number in
// the version number.
let versionSuffix = "";
if (process.env.CIRCLE_PR_NUMBER) {
  versionSuffix = "+pr." + process.env.CIRCLE_PR_NUMBER;
}

const babelVersion =
  require("../../packages/babel-core/package.json").version + versionSuffix;
function buildRollup(packages, buildStandalone) {
  const sourcemap = process.env.NODE_ENV === "production";
  const pkgJSON = require("./package.json");
  const version = pkgJSON.version + versionSuffix;
  const { dependencies = {}, peerDependencies = {} } = pkgJSON;
  const external = [
    ...Object.keys(dependencies),
    ...Object.keys(peerDependencies),
    // @babel/compat-data sub exports
    /@babel\/compat-data\/.*/,
    // Ideally they should be constructed from package.json exports
    // required by modules-commonjs
    /babel-plugin-dynamic-import-node\/utils/,
    // required by preset-env
    /@babel\/preset-modules\/.*/,
  ];

  log(`Compiling '${colors.cyan("*")}' with rollup ...`);
  return {
    external: buildStandalone ? [] : external,
    // all node modules are resolved as if they were placed in the n_m folder of package root
    preserveSymlinks: true,
    onwarn(warning, warn) {
      switch (warning.code) {
        case "CIRCULAR_DEPENDENCY":
        case "SOURCEMAP_ERROR": // Rollup warns about the babel-polyfills source maps
        case "INCONSISTENT_IMPORT_ATTRIBUTES": // @rollup/plugin-commonjs transforms require("...json") to an import without attributes
          return;
        case "UNUSED_EXTERNAL_IMPORT":
          warn(warning);
          return;
        case "MISSING_EXPORT":
          // Rollup warns about using babel.default at
          // https://github.com/babel/babel-polyfills/blob/4ac92be5b70b13e3d8a34614d8ecd900eb3f40e4/packages/babel-helper-define-polyfill-provider/src/types.js#L5
          // We can safely ignore this warning, and let Rollup replace it with undefined.
          if (
            warning.exporter
              .replace(/\\/g, "/")
              .endsWith("packages/babel-core/src/index.ts") &&
            warning.binding === "default" &&
            [
              "@babel/helper-define-polyfill-provider",
              "babel-plugin-polyfill-corejs2",
              "babel-plugin-polyfill-corejs3",
              "babel-plugin-polyfill-regenerator",
            ].some(pkg => warning.id.replace(/\\/g, "/").includes(pkg))
          ) {
            return;
          }
      }

      // We use console.warn here since it prints more info than just "warn",
      // in case we want to stop throwing for a specific message.
      console.warn(warning);

      // https://github.com/babel/babel/pull/12011#discussion_r540434534
      throw new Error("Rollup aborted due to warnings above");
    },
    plugins: [
      buildStandalone && rollupStandaloneInternals(),
      rollupBabelSource(),
      process.env.STRIP_BABEL_8_FLAG &&
        rollupDependencyCondition(bool(process.env.BABEL_8_BREAKING)),
      rollupReplace({
        preventAssignment: true,
        values: {
          "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
          BABEL_VERSION: JSON.stringify(babelVersion),
          VERSION: JSON.stringify(version),
        },
      }),
      rollupCommonJs({
        include: [
          // Bundle node_modules only when building standalone
          buildStandalone ? /node_modules/ : "./node_modules/*/*.js",
          "packages/babel-runtime/regenerator/**",
          "packages/babel-runtime/helpers/*.js",
          "packages/babel-preset-env/data/*.js",
          // Rollup doesn't read export maps, so it loads the cjs fallback
          "packages/babel-compat-data/*.js",
          // Used by @babel/standalone
          "packages/babel-compat-data/scripts/data/legacy-plugin-aliases.js",
          "packages/*/src/**/*.cjs",
        ],
        ignore:
          process.env.STRIP_BABEL_8_FLAG && bool(process.env.BABEL_8_BREAKING)
            ? [
                // These require()s are all in babel-preset-env/src/polyfills/babel-7-plugins.cjs
                // and packages/babel-preset-env/src/babel-7-available-plugins.cjs.
                // They are gated by a !process.env.BABEL_8_BREAKING check, but
                // @rollup/plugin-commonjs extracts them to import statements outside of the
                // check and thus they end up in the final bundle.
                "babel-plugin-polyfill-corejs2",
                "babel-plugin-polyfill-regenerator",
                "./babel-polyfill.cjs",
                "./regenerator.cjs",
                "@babel/compat-data/corejs2-built-ins",
                "@babel/plugin-syntax-import-assertions",
                "@babel/plugin-syntax-import-attributes",
              ]
            : [],
        dynamicRequireTargets: [
          // https://github.com/mathiasbynens/regexpu-core/blob/ffd8fff2e31f4597f6fdfee75d5ac1c5c8111ec3/rewrite-pattern.js#L48
          resolveChain(
            import.meta.url,
            "../../packages/babel-helper-create-regexp-features-plugin",
            "regexpu-core",
            "regenerate-unicode-properties"
          ).replace(/\\/g, "/") + "/**/*.js", // Must be posix path in rollup 3
        ],
        // Never delegate to the native require()
        ignoreDynamicRequires: false,
        // Align with the Node.js behavior
        defaultIsModuleExports: true,
      }),
      rollupBabel({
        envName: "rollup",
        babelHelpers: "bundled",
        configFile: "./babel.config.mjs",
        extensions: [".ts", ".js", ".mjs", ".cjs"],
        ignore: ["packages/babel-runtime/helpers/*.js"],
      }),
      rollupNodeResolve({
        extensions: [".ts", ".js", ".mjs", ".cjs", ".json"],
        browser: buildStandalone,
        exportConditions: buildStandalone ? ["browser"] : [],
        // It needs to be set to 'false' when using rollupNodePolyfills
        // https://github.com/rollup/plugins/issues/772
        preferBuiltins: !buildStandalone,
      }),
      rollupJson(),
      getBabelOutputPlugin({
        configFile: false,
        babelrc: false,
        plugins: [
          function babelPluginInlineConstNumericObjects({ types: t }) {
            return {
              visitor: {
                VariableDeclarator(path) {
                  const { node } = path;
                  if (
                    !t.isIdentifier(node.id) ||
                    !t.isObjectExpression(node.init)
                  ) {
                    return;
                  }

                  const binding = path.scope.getBinding(node.id.name);
                  if (!binding.constant) return;

                  const vals = new Map();
                  for (const { key, value } of node.init.properties) {
                    if (!t.isIdentifier(key)) return;
                    if (!t.isNumericLiteral(value)) return;
                    vals.set(key.name, value.value);
                  }

                  let all = true;
                  binding.referencePaths.forEach(({ parentPath }) => {
                    const { node } = parentPath;
                    if (
                      !t.isMemberExpression(node) ||
                      !t.isIdentifier(node.property) ||
                      node.computed ||
                      !vals.has(node.property.name)
                    ) {
                      all = false;
                      return;
                    }
                    parentPath.replaceWith(
                      t.numericLiteral(vals.get(node.property.name))
                    );
                  });

                  if (all) path.remove();
                },
              },
            };
          },
        ],
      }),
      buildStandalone &&
        rollupPolyfillNode({
          sourceMap: sourcemap,
          include: "**/*.{js,mjs,cjs,ts}",
        }),
      // https://github.com/babel/babel/issues/14301
      buildStandalone &&
        rollupReplace({
          preventAssignment: false,
          delimiters: ["", ""],
          values: {
            "return require.resolve(path);":
              "throw new Error('Babel internal error');",
          },
        }),
    ].filter(Boolean),
  };
}

const rlConfig = buildRollup();

export default defineConfig({
  build: {
    rollupOptions: {
      /* plugins: [
        rollupBabel({
          babelHelpers: "bundled",
          configFile: resolve(__dirname, "babel.config.mjs"),
        }),
      ],
      extensions: [".ts", ".js", ".mjs", ".cjs"],
      ignore: ["../babel-runtime/helpers/*.js"], */
      // all node modules are resolved as if they were placed in the n_m folder of package root
      ...rlConfig,
    },
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "uwu-parser",
      fileName: "index",
      formats: ["es"],
    },
  },
});
