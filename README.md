# HDS JAVASCRIPT LIBRARY

[![CI](https://github.com/healthdatasafe/hds-lib-js/actions/workflows/ci.yml/badge.svg)](https://github.com/healthdatasafe/hds-lib-js/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/healthdatasafe/hds-lib-js/graph/badge.svg)](https://codecov.io/gh/healthdatasafe/hds-lib-js)

Generic toolkit for server and web applications — [Health Data Safe](https://github.com/healthdatasafe).

**Full documentation: [healthdatasafe.github.io/hds-lib-js](https://healthdatasafe.github.io/hds-lib-js/)**

## Features

1. **HDS Data Model** — Load and query the [HDS data model](https://github.com/healthdatasafe/data-model): items, streams, authorizations, event types, datasources
2. **App Templates** — Consent-based data collection and sharing (Manager, Collector, Invite, Client flows)
3. **HDSSettings** — Per-app user settings (locale, theme, timezone, date format, unit system)
4. **HDSProfile** — Account-level profile (display name, avatar, date of birth, sex, country)
5. **Pryv extensions** — Extends [Pryv JS lib](https://github.com/pryv/lib-js) with Socket.io and Monitor support
6. **Toolkit** — Stream auto-creation, reminders, duration parsing, event formatting

## Quick start

```javascript
import HDSLib from 'hds-lib';

HDSLib.settings.setServiceInfoURL('https://demo.datasafe.dev/reg/service/info');
await HDSLib.initHDSModel();

const model = HDSLib.getHDSModel();
const weight = model.itemsDefs.forKey('body-weight');
```

## Dev

Requires **Node.js >= 24**. Source code is TypeScript in `./ts/` — tests run directly from source (Node 24 type stripping).

```bash
npm test               # Run tests (from ts/ source, no build needed)
npm run build          # Webpack bundle (dist/)
npm run lint           # ESLint
npm run test:coverage  # Coverage report
```

`tsc` is only used by the `prepare` script for npm/git-dep consumers.

Browser test suite: build then run `npx backloop.dev ./dist` and open `https://l.backloop.dev:4443/tests.html`
