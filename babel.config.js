module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        useBuiltIns: "entry",
        targets: "> 0.25%, not dead",
      },
    ],
    ["@babel/preset-typescript", { allowDeclareFields: true }],
  ],

  ignore: ["./lib"],
};
