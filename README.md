# HDS JAVASCRIPT LIBRARY

[![CI](https://github.com/healthdatasafe/hds-lib-js/actions/workflows/ci.yml/badge.svg)](https://github.com/healthdatasafe/hds-lib-js/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/healthdatasafe/hds-lib-js/graph/badge.svg)](https://codecov.io/gh/healthdatasafe/hds-lib-js)

Generic toolkit for server and web applications — [Health Data Safe](https://github.com/healthdatasafe).

**Full documentation: [healthdatasafe.github.io/hds-lib-js](https://healthdatasafe.github.io/hds-lib-js/)**

## Features

1. **HDS Data Model** — Load and query the [HDS data model](https://github.com/healthdatasafe/data-model): items, streams, authorizations, event types, datasources
2. **App Templates** — Consent-based data collection and sharing (Manager, Collector, Invite, Client flows). Includes the **AppTemplate JSON loader** and **custom-field declarations** (template-private streams via `clientData.hdsCustomField`). See [`ts/appTemplates/CUSTOM-FIELDS-AND-SYSTEM.md`](./ts/appTemplates/CUSTOM-FIELDS-AND-SYSTEM.md) for the design reference. (System messaging now flows through the CMC per-collector channel — see `open-pryv.io/components/cmc/IMPLEMENTERS-GUIDE.md`.) **`cmcDataExport`** rides that channel for GDPR / HIPAA data-export requests: `requestDataExport` (patient), `fulfillDataExportRequest` (doctor), `listDataExportRequests` (either side); the convention is documented in data-model `documentation/CUSTOM-FIELDS-AND-SYSTEM.md`. **`cmcDocuments`** shares one document with one contact in a conversation, takes it back, and lets a contact send documents (data-model `document-shares`). **`cmcItemReminders`** lets a contact remind the person to fill in one item of its request (data-model `item-reminder`). **`appDescription`** names the app holding an access by one rule (catalogue, OAuth registration, the app's own `hds-app-manifest`; data-model `documentation/APP-DESCRIPTION.md`).
3. **HDSSettings** — **Per-app** settings, stored on the app's own `baseStream`: `theme`, `displayName`, and the dynamic `preferred-display-*` / `preferred-input-*` keys. Each app gets its own private copy — these do **not** interoperate between apps, by design.
4. **HDSProfile** — **Account-level**, shared across every app and connection: identity (display name, avatar, name, date of birth, sex, country) **and account preferences** (`preferredLocales`, `timezone`, `dateFormat`, `unitSystem`). Preferences the whole ecosystem should agree on belong here, not in HDSSettings. (`theme` is the deliberate exception — it stays per-app.)
5. **Pryv extensions** — Extends [Pryv JS lib](https://github.com/pryv/lib-js) with Socket.io and Monitor support
6. **Toolkit** — Stream auto-creation, reminders, duration parsing, event formatting (`eventToShortText` handles `{drug}` / `{regimen}` / `{procedure}` payload shapes uniformly, with optional `×count`, procedure findings, and truncated notes)

## Quick start

```javascript
import HDSLib from 'hds-lib';

HDSLib.settings.setServiceInfoURL('https://demo.datasafe.dev/reg/service/info');
await HDSLib.initHDSModel();

const model = HDSLib.getHDSModel();
const weight = model.itemsDefs.forKey('body-weight');

// Resolve the itemDef for an event — walks parent streams for context-via-substream cases
// (e.g. event on `treatment-fertility` resolves to `treatment-coded` registered at `treatment`).
const itemDef = model.itemsDefs.forEvent(event);
```

## Importer helpers

Helpers for code that writes or checks imported records (lab reports, documents, encounters). Each implements a
convention specified in the [data model documentation](https://github.com/healthdatasafe/data-model/tree/main/documentation);
the right column names the page. All need the model loaded (`initHDSModel()`) except where noted.

| Helper | What it does | Import | Convention |
|---|---|---|---|
| `toolkit.StreamsAutoCreate` | `attachToConnection(connection)`, then `ensureExistsForItems(['body-weight', …])` creates the model streams the items need before the first write | `import { toolkit } from 'hds-lib'` | [`toolkit.md`](https://healthdatasafe.github.io/hds-lib-js/toolkit) |
| `formatEventDate(eventOrTimeSec, opts?)` | Displays an event's date, honouring a partial date (`clientData.hdsTimePrecision`: `day`, `month`, `year`, `approx`) (no model needed) | `import { formatEventDate } from 'hds-lib'` | [PARTIAL-DATES.md](https://github.com/healthdatasafe/data-model/blob/main/documentation/PARTIAL-DATES.md) |
| `model.itemsDefs.forLoinc(code)` | The item that owns a LOINC code, or null: a result with that code goes on the item, not on `lab-result/coded-v1` | `getHDSModel().itemsDefs` | [BLOOD-CHEMISTRY.md](https://github.com/healthdatasafe/data-model/blob/main/documentation/BLOOD-CHEMISTRY.md) |
| `checkLabResultCoded(event)` | Warnings on a `lab-result/coded-v1` event: `owned-by-item`, `no-loinc`, `invalid-loinc` | `import { checkLabResultCoded } from 'hds-lib'` | BLOOD-CHEMISTRY.md |
| `isValidLoincCode(code)` | LOINC check digit (no model needed) | `import { isValidLoincCode } from 'hds-lib'` | BLOOD-CHEMISTRY.md |
| `labLoincOf(event)`, `labNumberOf(event)`, `labComparatorOf(event)`, `isExactLabValue(event)`, `labUnitText(content)`, `labSeriesKey(event)`, `labValueToFhir(event)` | Read a lab event: its LOINC code, its number (INR `ratio/generic` included), a printed limit (`< 1.5`), the unit as printed, its chart series, its FHIR `Observation.value[x]` (only `labLoincOf`, `labSeriesKey`, `labValueToFhir` need the model) | `import { labLoincOf, … } from 'hds-lib'` | BLOOD-CHEMISTRY.md, [FHIR-MAPPING.md](https://github.com/healthdatasafe/data-model/blob/main/documentation/FHIR-MAPPING.md) |
| `withRelatedMirror(event, previousContent?)` | Returns the `clientData` to write: every event id held in content (`supersedes`, `authors[].eventId`, `encounterId`, `participants[].eventId`, …) mirrored as `related.<eventId>: true`, and a provider's `hdsGln` / `hdsZsr` set (no model needed) | `import { withRelatedMirror } from 'hds-lib'` | [PROVENANCE.md](https://github.com/healthdatasafe/data-model/blob/main/documentation/PROVENANCE.md), [ENCOUNTER.md](https://github.com/healthdatasafe/data-model/blob/main/documentation/ENCOUNTER.md), [DOCUMENTS.md](https://github.com/healthdatasafe/data-model/blob/main/documentation/DOCUMENTS.md) |
| `checkRelatedMirror(event, targets?)`, `contentEventIds(event)` | Warnings for a missing or wrong mirror; the event ids an event holds in content (no model needed) | `import { checkRelatedMirror } from 'hds-lib'` | PROVENANCE.md, ENCOUNTER.md |
| `appTemplates.permissionView(perm)`, `appTemplates.dataName(streamId)` | Names a requested permission from the model (with "and everything under it" for a parent stream), to show what an importer's access covers (without the model: `inModel: false`) | `import { appTemplates } from 'hds-lib'` | BLOOD-CHEMISTRY.md, [`app-templates.md`](https://healthdatasafe.github.io/hds-lib-js/app-templates) |

Constants beside them: `LAB_RESULT_CODED`, `LAB_COMPARATORS`, `ENCOUNTER_VISIT`, `PROVIDER_PRACTITIONER`,
`PROVIDER_ORGANIZATION`, `IDENTIFIER_SYSTEM_GLN`, `IDENTIFIER_SYSTEM_ZSR`. `clientData.sourceKey` and
`clientData.hdsInstrument` (PROVENANCE.md) and medication coding ([MEDICATION.md](https://github.com/healthdatasafe/data-model/blob/main/documentation/MEDICATION.md))
are conventions with no helper: the importer writes them itself.

## Content-Security-Policy

`hds-lib` requires **no `'unsafe-eval'`**. Up to 2.6.1 it did — the AppTemplate loader compiled its
JSON schema with Ajv at import time, and because that ran at module top level the CSP refusal threw
during module-graph initialisation, so the consuming app rendered a **blank page** rather than
degrading. From 2.6.2 the validator is precompiled at build time and `ajv` is a devDependency, so
nothing generates code from strings at runtime.

Only one origin is hardcoded (the service-info URL you configure); the rest are discovered from that
document's `assets` map. **[Full list of origins and a ready-to-paste policy →](https://healthdatasafe.github.io/hds-lib-js/csp)**

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
