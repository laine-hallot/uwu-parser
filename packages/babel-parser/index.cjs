try {
  module.exports = require("./dist/index.cjs");
} catch {
  module.exports = require("./dist/index.js");
}
