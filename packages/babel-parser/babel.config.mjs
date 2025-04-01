import bitDecorator from "../../scripts/babel-plugin-bit-decorator/plugin.cjs";
import pathUtils from "path";

function normalize(src) {
  return src.replace(/\//, pathUtils.sep);
}

function pluginBabelParserTokenType({
  types: { isIdentifier, numericLiteral },
}) {
  const tokenTypesMapping = getTokenTypesMapping();
  return {
    visitor: {
      MemberExpression(path) {
        const { node } = path;
        if (
          isIdentifier(node.object, { name: "tt" }) &&
          isIdentifier(node.property) &&
          !node.computed
        ) {
          const tokenName = node.property.name;
          const tokenType = tokenTypesMapping.get(node.property.name);
          if (tokenType === undefined) {
            throw path.buildCodeFrameError(
              `${tokenName} is not defined in ${tokenTypeSourcePath}`
            );
          }
          path.replaceWith(numericLiteral(tokenType));
        }
      },
    },
  };
}

export default function (api) {
  const parserAssumptions = {
    iterableIsArray: true,
  };

  api.cache.never();
  return {
    targets: {},
    assumptions: {
      constantSuper: true,
      ignoreFunctionLength: true,
      ignoreToPrimitiveHint: true,
      mutableTemplateObject: true,
      noClassCalls: true,
      noDocumentAll: true,
      noNewArrows: true,
      setClassMethods: true,
      setComputedProperties: true,
      setSpreadProperties: true,
      skipForOfIteratorClosing: true,
      superIsCallableConstructor: true,
    },
    babelrc: false,
    browserslistConfigFile: false,

    // Our dependencies are all standard CommonJS, along with all sorts of
    // other random files in Babel's codebase, so we use script as the default,
    // and then mark actual modules as modules farther down.
    sourceType: "script",
    comments: false,
    presets: [
      ["@babel/transform-object-rest-spread", { useBuiltIns: true }],
      "@babel/preset-env",
      "@babel/preset-typescript",
    ],
    overrides: [
      {
        test: [
          "packages/babel-parser",
          "packages/babel-helper-validator-identifier",
        ].map(normalize),
        plugins: [
          "babel-plugin-transform-charcodes",
          pluginBabelParserTokenType,
        ],
        assumptions: parserAssumptions,
      },
      {
        test: [
          "packages/babel-generator",
          "packages/babel-helper-create-class-features-plugin",
          "packages/babel-helper-string-parser",
        ].map(normalize),
        plugins: ["babel-plugin-transform-charcodes"],
      },
    ],
    plugins: [bitDecorator],
  };
}
