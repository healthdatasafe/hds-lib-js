---
layout: default
title: Getting Started
---

# Getting Started

## Installation

```bash
npm install git+https://github.com/healthdatasafe/hds-lib-js.git
```

## Node.js usage

```javascript
const HDSLib = require('hds-lib');

// 1. Configure
HDSLib.settings.setServiceInfoURL('https://demo.datasafe.dev/reg/service/info');
HDSLib.settings.setPreferredLocales(['en', 'fr']);

// 2. Initialize the model singleton (once per app)
await HDSLib.initHDSModel();

// 3. Use the model
const model = HDSLib.getHDSModel();
const weightItem = model.itemsDefs.forKey('body-weight');
console.log(weightItem.label); // "Weight"
```

## Browser usage

```html
<head>
  <script src="node_modules/hds-lib/dist/hds-lib.js"></script>
  <script>
    HDSLib.settings.setServiceInfoURL('https://demo.datasafe.dev/reg/service/info');
    HDSLib.settings.setPreferredLocales(['fr', 'en']);

    (async () => {
      await HDSLib.initHDSModel();
      const model = HDSLib.getHDSModel();

      // Create a service instance
      const service = new HDSLib.HDSService();
    })();
  </script>
</head>
```

## Hosted browser bundle

The browser bundle is also published on GitHub Pages, for pages that cannot run an
npm install (server-rendered sites, integration samples, quick prototypes):

```html
<!-- pinned: never changes -->
<script src="https://healthdatasafe.github.io/hds-lib-js/v2.2.0/hds-lib.js"></script>

<!-- rolling: always the latest release -->
<script src="https://healthdatasafe.github.io/hds-lib-js/hds-lib.js"></script>
```

**Pin a version in anything you rely on.** The rolling URL tracks `main`, so the
library under it changes when a release does, including its `pryv` dependency.
That is not theoretical: `pryv` 3.10 narrowed the `AUTHORIZED` payload delivered to
`pryv.Browser.setupAuth`'s `onStateChange` to `{ status, id, key, serviceInfo }`, so
code reading `apiEndpoint` from it stopped working. Obtain the connection with
`pryv.connectFromKey(key, serviceInfoUrl)` instead. Note that the cookie-autologin
path still delivers the wider payload, so a caller that reads `apiEndpoint` fails
only on a fresh authorization and appears to work on a restored session.

Each deploy publishes both the rolling root and an immutable `/v<version>/` copy;
`version.json` sits next to each bundle and reports the version, commit and build date.

## Entry points

| Target | Entry point |
|--------|-------------|
| Node.js (CJS) | `js/index.js` |
| TypeScript | `ts/index.ts` |
| Browser (bundled) | `dist/hds-lib.js` |
| Browser (hosted, pinned) | `https://healthdatasafe.github.io/hds-lib-js/v<version>/hds-lib.js` |
| Browser (hosted, rolling) | `https://healthdatasafe.github.io/hds-lib-js/hds-lib.js` |

## Build from source

```bash
# Install dependencies
npm install

# Build (TypeScript to JS + webpack bundle)
npm run build

# Run tests
npm run test

# Run a specific test
npm run test -- --grep="pattern"

# Coverage
npm run test:coverage
```

## HDSService

`HDSService` extends `pryv.Service` and automatically uses the default service info URL configured via `settings.setServiceInfoURL()`.

```javascript
// Uses the URL from settings.setServiceInfoURL()
const service = new HDSLib.HDSService();

// Or provide a custom URL
const service = new HDSLib.HDSService('https://custom.datasafe.dev/reg/service/info');
```
