# Agent primer — hds-lib-js

This file orients agents (Claude or others) working on `hds-lib-js`. It deliberately **does not duplicate** information that already lives in this repo — it links you to the right document for each concern. Read this first; then read the linked docs as you start a task.

---

## Read first

Before touching code, read these in order:

1. **[README.md](README.md)** — what the package is, public surface, dev commands. Also lists the badge URLs and the public docs site.
2. **[docs/index.md](docs/index.md)** plus the published site at **<https://healthdatasafe.github.io/hds-lib-js/>** — full user-facing API documentation. The pages under `docs/` are the source for that site.
3. **[docs/getting-started.md](docs/getting-started.md)** — install + bootstrap (`settings.setServiceInfoURL`, `initHDSModel`).
4. **[docs/hds-model.md](docs/hds-model.md)** — `HDSModel`, `itemsDefs`, `streams`, `eventTypes`, `datasources`, `authorizations`, `conversions`, `converters`, `appStreams`, `Overload`.
5. **[docs/app-templates.md](docs/app-templates.md)** + **[AppTemplates.md](AppTemplates.md)** — `AppManagingAccount` / `AppClientAccount` / `Collector` / `CollectorClient` / `CollectorRequest` / `Contact`. The legal/consent-flow shape used by every HDS app.
6. **[docs/settings.md](docs/settings.md)** — global library settings (`settings.setServiceInfoURL`, init order). Distinct from per-user `HDSSettings`.
7. **[docs/localization.md](docs/localization.md)** — `localizableText` shape and `localizeText(...)` resolution rules.
8. **[docs/toolkit.md](docs/toolkit.md)** — `StreamsAutoCreate`, reminders, duration parsing, event formatters.
9. **[docs/utilities.md](docs/utilities.md)** — `HDSLibError`, misc helpers.
10. **[CHANGELOG.md](CHANGELOG.md)** — every behaviour change worth knowing about, in reverse chronological order. Read the most recent entries before estimating an API.

Anything not covered above is either internal or new; in that case, read the source under [`ts/`](ts/) and add docs as you go (do not let new public surface escape `docs/`).

---

## Pryv concepts you must hold in your head

`hds-lib-js` wraps and extends [`pryv` JS lib](https://github.com/pryv/lib-js). Most of what this library does is express HDS-specific patterns on top of standard Pryv objects. **Before designing anything that touches Pryv data shapes, read the corresponding section of the Pryv API reference.**

Authoritative sources:

- **Data in Pryv** (read this first if you've never worked with Pryv): <https://pryv.github.io/data-in-pryv/> — narrated walk-through of streams, events, accesses, and how they fit together. The clearest mental model document Pryv publishes.
- Pryv concepts overview: <https://pryv.github.io/concepts/>
- Pryv API reference: <https://pryv.github.io/reference/> (canonical home; `api.pryv.com/reference/` redirects here).
- Pryv event-types catalogue: <https://pryv.github.io/event-types/>
- Pryv guides — pick the relevant one, e.g. [data-modelling](https://pryv.github.io/guides/data-modelling/), [app-guidelines](https://pryv.github.io/guides/app-guidelines/), [webhooks](https://pryv.github.io/guides/webhooks/), [custom-auth](https://pryv.github.io/guides/custom-auth/), [consent](https://pryv.github.io/guides/consent/), [audit-logs](https://pryv.github.io/guides/audit-logs/).

Key concepts you will encounter constantly here:

| Pryv concept | Why it matters in hds-lib | Reference |
|---|---|---|
| **Service info** | Discovery endpoint published by every Pryv platform. `settings.setServiceInfoURL(url)` is the only mandatory bootstrap. The HDS data-model URL is published as an `assets.hds-model` override on top of this. | [Service info](https://pryv.github.io/reference/#service-info) |
| **Streams** | Tree of clinical-domain containers. The HDS data-model defines the stream tree; `HDSModel.streams` exposes it. Permissions are stream-scoped and inherit down the tree. | [Stream](https://pryv.github.io/reference/#stream) · [methods](https://pryv.github.io/reference/#methods-streams) |
| **Events** | The actual data points. Each event has `streamIds`, `type`, `content`, `time`, optional `duration`, `integrity`. HDS items map (`streamId` × `type`) → an `HDSItemDef`. | [Event](https://pryv.github.io/reference/#event) · [methods](https://pryv.github.io/reference/#methods-events) |
| **Event types** | Schema + unit. HDS event types live in [`data-model/definitions/eventTypes/`](https://github.com/healthdatasafe/data-model/tree/main/definitions/eventTypes); Pryv's catalogue of standard types is at the link. `HDSModel.eventTypes.getEventTypeSymbol(type)` resolves the unit. | [Event-types catalogue](https://pryv.github.io/event-types/) |
| **Accesses & permissions** | `personal`, `app`, `shared`. App auth produces an `app` access; `Collector` flows produce `shared` accesses. Levels: `read` / `contribute` / `manage`. Many HDS bugs come from confusing these. | [Access](https://pryv.github.io/reference/#access) · [methods](https://pryv.github.io/reference/#methods-accesses) |
| **Authentication / app auth** | `app-web-auth3-hds` drives the OAuth-like flow. The HDS `Application` / `AppClientAccount` / `AppManagingAccount` classes wrap `pryv.Browser.AuthController`. | [Auth request](https://pryv.github.io/reference/#auth-request) · [authenticate-your-app](https://pryv.github.io/reference/#authenticate-your-app) |
| **Methods (`events.get`, `events.create`, ...)** | The API verbs. `HDSConnection` wraps `pryv.Connection` and adds `apiOne(method, params)`. | [Methods](https://pryv.github.io/reference/#methods) · [method-ids](https://pryv.github.io/reference/#method-ids) |
| **WebSockets / Socket.io / monitor** | Real-time event change feed. `MonitorScope` here is a thin wrapper around the Pryv socket layer. | [Call with WebSockets](https://pryv.github.io/reference/#basics-call-with-websockets) · [Subscribe to changes (WebSockets)](https://pryv.github.io/reference/#basics-subscribe-to-changes-with-websockets) |
| **Integrity** | Per-event `integrity: "EVENT:0:sha256-..."` hash. Don't strip or recompute manually. | [Integrity](https://pryv.github.io/reference/#integrity) |
| **HF events** | High-frequency event format (used by some bridges). Not common in HDS apps yet. | [HF events](https://pryv.github.io/reference/#hf-events) · [HF series](https://pryv.github.io/reference/#hf-series) |

If a piece of code seems to be reinventing one of the concepts above, stop and check whether the Pryv lib already exposes it. The right answer is almost always "use the Pryv primitive directly."

---

## Cross-repo relationships

`hds-lib-js` sits at the centre of an ecosystem. Changes here ripple. Know the dependents before you change a public type.

- **[data-model](https://github.com/healthdatasafe/data-model)** (`@hds/data-model`) — the YAML-defined items / streams / event types this library loads at runtime. The library never bundles the data-model; it fetches `pack.json` via service-info. Design rules (item naming, scale-hook placement, stream tree, etc.) are in [`data-model/AGENTS.md`](https://github.com/healthdatasafe/data-model/blob/main/AGENTS.md), and the YAML lives under [`data-model/definitions/`](https://github.com/healthdatasafe/data-model/tree/main/definitions).
- **[hds-forms-js](https://github.com/healthdatasafe/hds-forms-js)** — React form renderers for `HDSItemDef`. Re-exports several types from `hds-lib` (e.g. `appTemplates.ItemLabels`, `appTemplates.ItemCustomization`). When you change those types, type-check `hds-forms-js` too.
- **[app-web-auth3-hds](https://github.com/healthdatasafe/app-web-auth3-hds)** — auth flow used by every HDS app. Treat the public API surface as a contract.
- **[lib-bridge-js](https://github.com/healthdatasafe/lib-bridge-js)** — base library for HDS server-side bridges; same compatibility concerns as any consumer.

---

## Conventions enforced in this repo

These are short reminders. The detail lives in the linked source.

### ESM, TS source as truth

- `"type": "module"`, `"module": "nodenext"`. All imports use explicit `.ts` / `.js` extensions.
- TypeScript source under [`ts/`](ts/) is the source of truth. Tests run **directly from source** (Node 24 type stripping); `npm test` does not need a build.
- The package ships compiled output from [`js/`](js/) (built by `npm run prepare` → `tsc`). Consumers pulling via `git+https://...` hit the `prepare` hook on install. **Never publish without `js/` compiled.**
- Webpack bundle in [`dist/`](dist/) (built by `npm run build`) is for the browser test runner only. Do not import from `dist/` in code.
- `pryv` is consumed via [`ts/patchedPryv.ts`](ts/patchedPryv.ts) — declaration merging (const + namespace) so `pryv` is both value and type namespace. Do not import `pryv` directly anywhere else; always go through `patchedPryv.ts`.

### Public surface

Every value/type intended for external consumption is exported from [`ts/index.ts`](ts/index.ts). If a consumer needs something that is not there, **add the export** and document it under `docs/` — do not let consumers reach into deep paths.

### Tests

- [`tests/`](tests/) — mocha + node `assert`. One file per concept (`apptemplates.test.js`, `eventToShortText.test.js`, `itemLabels.test.js`, ...). Most tests load `pack.json` from the deployed `model.datasafe.dev` over HTTP, so the test runner needs network access.
- [`tests-browser/`](tests-browser/) — same suites compiled for the browser test runner. Run via `backloop.dev`.
- New tests go next to similar existing ones. New behaviour without a test is not done.

### Versioning

- Bump `version` in `package.json` for **every** change that consumers can observe.
- Add a `## [x.y.z] - YYYY-MM-DD` block in [CHANGELOG.md](CHANGELOG.md). Group changes under `Added` / `Changed` / `Removed`. Keep the wording concrete (one bullet = one observable change).
- Consumers pin to git URLs, not npm versions, but the version + changelog is still how humans read the diff.

### Gotchas

- **`tsc` stale output**: `tsc` may skip re-emitting a `.js` file if it already exists and didn't notice an internal change. After `npm run prepare` / `npm run build:ts`, **verify the relevant file in `js/` actually contains your change** before committing. If not, delete the stale `js/<path>.js` and re-run.
- **Vite cache in consumer apps**: when you change a public type or export and a consumer app (Vite-based) doesn't pick it up, clear `<consumer>/node_modules/.vite` and restart the dev server.
- **npm-link traps**: when an HDS app is npm-linked to `hds-lib`, both the app and any nested package (e.g. `hds-forms-js`'s [`src-test-app/`](https://github.com/healthdatasafe/hds-forms-js/tree/main/src-test-app)) must link the **same** `hds-lib` to avoid duplicate singletons (settings, model). If you see "two HDSModels" symptoms (e.g. `getHDSModel()` returning empty), this is the cause. **Run `cd _local && npm run check-links && npm run verify-live-source`** to diagnose. Full methodology: `_macro/_claude-memory/conventions.md § Live cross-repo development — quickstart` + `_plans/49-local-dev-dependency-graph-study/PLAN.md`.
- **`exports.import` MUST point at TS source** (`./ts/index.ts` here). Vite resolves the `import` condition in dev mode; pointing at compiled JS causes downstream libs (hds-forms-js, hds-react-timeline) to inline a second copy of `hds-lib` → duplicate-singleton bug. Verify with `cd _local && npm run verify-live-source`.
- **Initialization order**: in apps that call `initBoiler(name, configDir)` (server side) or `pryv.Browser.AuthController` (client side), do so **before** any `getHDSModel()` / `HDSSettings` lookup.

---

## When in doubt

- For a Pryv question: read the Pryv API reference, do not invent.
- For an HDS data-model question: read [`AGENTS.md`](https://github.com/healthdatasafe/data-model/blob/main/AGENTS.md) and the YAML under [`definitions/`](https://github.com/healthdatasafe/data-model/tree/main/definitions) in [healthdatasafe/data-model](https://github.com/healthdatasafe/data-model).
- For a forms / UI question: read [`README.md`](https://github.com/healthdatasafe/hds-forms-js/blob/main/README.md) and the [`src/components/`](https://github.com/healthdatasafe/hds-forms-js/tree/main/src/components) tree in [healthdatasafe/hds-forms-js](https://github.com/healthdatasafe/hds-forms-js).

If the answer to a question is not in any of these places, that is a documentation bug — open an issue (or PR an addition to `docs/`) rather than guessing.
