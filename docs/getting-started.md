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

## Entry points

| Target | Entry point |
|--------|-------------|
| Node.js (CJS) | `js/index.js` |
| TypeScript | `ts/index.ts` |
| Browser (bundled) | `dist/hds-lib.js` |

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
