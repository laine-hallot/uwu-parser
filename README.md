<p align="center">
  <a href="https://babeljs.io/" style="position:relative">
    <img alt="babel" src="https://raw.githubusercontent.com/babel/logo/master/babel.png" width="546">
  </a>
</p>

<p align="center">
  The parser for understanding the next genewation JavaScript.
</p>

<h2 align="center">UwU parrser</h2>

This repo is just a fork of the babel mono repo that changes a few keywords in `@babel/parser`.

## Intro

Babel is a tool that helps you write code in the latest version of JavaScript. When your supported environments don't support certain features natively, Babel will help you compile those features down to a supported version.

**In**

```js
// ES2020 nullish coalescing
function greet(input) {
  return input ?? "Hello world";
}
```

**Out**

```js
function greet(input) {
  return input != null ? input : "Hello world";
}
```

Try it out at our [REPL](https://babel.dev/repl#?browsers=defaults%2C%20not%20ie%2011&loose=true&code_lz=GYVwdgxgLglg9mABAcwE4FN1QBQzABxCgEpEBvAKEUQyhFST0KkQH5XEAiACXQBs-cRAHc4qPgBNOAbgoBfIA&shippedProposals=true&sourceType=script&lineWrap=true&presets=env%2Cenv&prettier=true).

## FAQ

### Where are the docs?

Check out our website: [babeljs.io](https://babeljs.io/), and report issues/features at [babel/website](https://github.com/babel/website/issues).

### Want to report a bug or request a feature?

Please read through our [CONTRIBUTING.md](CONTRIBUTING.md) and fill out the issue template at [babel/issues](https://github.com/babel/babel/issues)!

### Want to contribute to Babel?

Check out:

- Our [#development](https://babeljs.slack.com/messages/development) Slack channel and say hi! ([sign-up](https://slack.babeljs.io))
- Issues with the [good first issue](https://github.com/babel/babel/labels/good%20first%20issue) and [help wanted](https://github.com/babel/babel/labels/help%20wanted) label. We suggest also looking at the [closed ones](https://github.com/babel/babel/issues?utf8=%E2%9C%93&q=is%3Aclosed+label%3A%22good+first+issue%22) to get a sense of the kinds of issues you can tackle.

Some resources:

- Our [CONTRIBUTING.md](CONTRIBUTING.md) to get started with setting up the repo.
- Our discussions/notes/roadmap: [babel/notes](https://github.com/babel/notes)
- Our progress on TC39 proposals: [babel/proposals](https://github.com/babel/proposals)
- Our blog which contains release posts and explanations: [/blog](https://babeljs.io/blog)
- Our videos page with talks about open source and Babel: [/videos](https://babeljs.io/videos)
- Our [podcast](https://podcast.babeljs.io)

### How is the repo structured?

The Babel repo is managed as a [monorepo](doc/design/monorepo.md) that is composed of many [npm packages](packages/README.md).

## License

[MIT](LICENSE)
