# HDS JAVASCRIPT LIBRARY

[![CI](https://github.com/healthdatasafe/hds-lib-js/actions/workflows/ci.yml/badge.svg)](https://github.com/healthdatasafe/hds-lib-js/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/healthdatasafe/hds-lib-js/graph/badge.svg)](https://codecov.io/gh/healthdatasafe/hds-lib-js)

Generic toolkit for server and web applications — [Health Data Safe](https://github.com/healthdatasafe).

**Full documentation: [healthdatasafe.github.io/hds-lib-js](https://healthdatasafe.github.io/hds-lib-js/)**

## Features

1. **Settings** — Configure service endpoints and localization
2. **Pryv extensions** — Extends [Pryv JS lib](https://github.com/pryv/lib-js) with Socket.io and Monitor support
3. **HDS Data Model** — Load and query the [HDS data model](https://github.com/healthdatasafe/data-model-draft): items, streams, authorizations, event types, datasources
4. **App Templates** — Consent-based data collection and sharing (Manager, Collector, Invite, Client flows)
5. **Toolkit** — Stream auto-creation, reminders, duration parsing

## Quick start

```javascript
const HDSLib = require('hds-lib');

HDSLib.settings.setServiceInfoURL('https://demo.datasafe.dev/reg/service/info');
await HDSLib.initHDSModel();

const model = HDSLib.getHDSModel();
const weight = model.itemsDefs.forKey('body-weight');
```

## Dev

Source code is in TypeScript in `./ts`.

```bash
npm run build          # TypeScript + webpack bundle
npm run test           # Node tests
npm run test:coverage  # Coverage report
```

Browser test suite: build then run `npx backloop.dev ./dist` and open `https://l.backloop.dev:4443/tests.html`
