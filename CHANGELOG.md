# Changelog

## [Unreleased]

## [1.0.2] - 2026-06-01

### Changed — `cmcAppScope.ensureAppScope` no-subPath path is now a no-op

The CMC plugin's `cmcAccessProvisionAppScopeHook` (deployed open-pryv.io demo + prod 2026-05-26, plan-61) auto-provisions `:_cmc:apps:<appCode>` on `accesses.create` / `accesses.update` whenever the access references a matching permission. So `ensureAppScope(conn, appCode)` (no `subPath`) no longer needs to call `streams.create` — it returns the leaf id directly. The sub-scope path (`ensureAppScope(conn, appCode, subPath)`) is unchanged. Public API is unchanged. Verification trace: `_plans/_TEMP/_done/cmc-per-app-lazy-provision-2026-06-01.md`.

### Added (plan 53 phase A — `HDSModelStreams.isContext()` helper)
- `HDSModelStreams#isContext(streamId): boolean` — returns `true` iff the stream's data-model definition carries `role: 'context'` (the D3 descendant-streamId marker flag introduced in `@hds/data-model` Plan 53 Phase A). Unknown streamIds return `false` (no throw).
- Use this to elide / mute / re-render context streams as metadata in settings trees, form-section renderers, and dashboards rather than as data-bearing buckets. Runtime resolution (`itemsDefs.forEvent` walk-up) is unaffected.
- Tests: `[CTXR-P/Q/R/S]` in `tests/contextResolution.test.js`. Validates against the locally-built `data-model/dist/pack.json` so the flag is sourced from real YAML.

## [1.0.0] - 2026-05-27

### Plan 61 Phase C — legacy collector code deleted

API surface frozen: no more `Collector` / `CollectorClient` / `CollectorInvite` classes, no `AppManagingAccount.createCollector` / `getCollectors` / `getCollectorById`, no `AppClientAccount.handleIncomingRequest` / `getCollectorClients` / `getContacts`, and `Contact` is CMC-only. The CMC path (`@pryv/cmc` + the `cmc*` helpers in this lib — `cmcFormSpec`, `cmcAppScope`, `cmcConstants`) is the only supported flow for doctor-side forms and patient-side relationships.

`CollectorRequest` survives as a pure editor-state class consumed by `hds-forms-js`'s FormBuilder UI (locked via plan 61 Path B).

### BREAKING

- **Deleted classes:** `Collector`, `CollectorClient`, `CollectorInvite`.
- **Deleted from `Contact`:** `sources`, `collectorClients`, `invites` fields + their `addSource`/`addCollectorClient`/`addInvite` methods. Deleted getters: `primaryCollectorClient`, `incomingCollectorClients`, `isPending`, `hasPendingUpdate`, `pendingUpdateClients`, `pendingCollectorClient`, `acceptPendingInvite`, `refusePendingInvite`, `formSections`, `chatStreams`, `chatPost`, `collectorSources`, `bridgeSources`. Deleted static methods: `Contact.groupByContact`, `Contact.sourceFromAccess`. The `accessObjects` field is kept (used by `initStreamCache` + `eventIsAccessible` + `eventIsFromContact`, populated by `Contact.aggregateCmc`).
- **Rewritten `Contact` getters (CMC-only):** `status` (derived from `cmcRelationships[].acceptedAt`), `hasChat` (from `cmcRelationships[].features.chat`), `appStreamIds` (distinct `appCode` set), `allPermissions` (alias for `cmcAllPermissions`), `isActive`, `accessIds`.
- **Deleted from `AppManagingAccount`:** `createCollector`, `createCollectorUnitialized`, `getCollectors`, `getCollectorById`, `getContacts`. Class is now a thin `Application` subclass.
- **Deleted from `AppClientAccount`:** `handleIncomingRequest`, `getCollectorClientByKey`, `getCollectorClients`, `getContacts`. Class is now a thin `Application` subclass.
- **Deleted from `interfaces.ts`:** `ContactSource`, `ContactSourceType`, `ChatStreams`, `AccessUpdateAction`, `AccessUpdateRequestContent`, `AccessUpdateRequest`. `Permission`, `RequestSectionType`, `CollectorSectionInterface` are kept.
- **Deleted from `appTemplates` re-exports:** `Collector`, `CollectorClient`, `CollectorInvite`, `ContactInvite`, `AccessUpdateRequest*`.
- **`collectItemLabels(itemKey, contacts)`** now walks `contact.cmcRelationships[].hdsFormSpec.sections` instead of legacy `CollectorClient.getSections()`.

### Migration

Callers can pin to `github:healthdatasafe/hds-lib-js#0fedc1d` (the last pre-1.0 commit) until ported to the CMC API. `bridge-redcap` is frozen on this pin pending its own port — see [`_macro/bridge-redcap/CLAUDE.md`](../../bridge-redcap/CLAUDE.md) for the port checklist.

For the doctor-side form-storage migration, see `doctor-dashboard/app/formSpecAdapter.ts` (CollectorRequest ↔ FormSpec translators) and `doctor-dashboard/app/cmcDoctor.ts` (`saveFormSpec` / `listInviteRecordsFor` / etc.) for the reference port.

## [Unreleased]

### Removed

- **Plan-45 system-feature types + resolver (dormant).** Deleted `ts/appTemplates/systemFeatureTypes.ts` along with `HDSSystemAlertDef`, `HDSSystemAckDef`, `HDSSystemFeature`, `SystemMessageType`, `SystemFeatureResolution` and the `resolveStreamSystemFeature` / `resolveStreamSystemFeatureDetailed` helpers. The account-level `app-system-out` / `app-system-in` stream pair was superseded by the **CMC per-collector channel** (`:_cmc:apps:<app-code>:[<path>:]collectors:<counterparty-slug>`) carrying `notification/alert-cmc`, `notification/ack-cmc`, `consent/scope-request-cmc`, `consent/scope-update-cmc`. The mode-3 `existingStreamRefs[]` mechanism on `CollectorRequest` stays — generic, can reference any pre-existing stream. Data-model layer (`message/system-alert` + `message/system-ack` eventType registrations) left intact so legacy data stays valid. See `_macro/_plans/64-on-the-go-app-testing-atwork/PLAN.md` Phase A.

## [0.11.0] - 2026-05-14

### Plan 58 — `pryv@3.1.0` + `accesses.update` rollout

Bumps `pryv` 3.0.4 → 3.1.0 (matching `@pryv/monitor` and `@pryv/socket.io`). Collapses the Plan 27 "delete-then-create" access-update workaround into a single in-place `accesses.update` call. **Hard-requires a pryv core supporting `accesses.update`** (Plan 66 — deployed to `demo.datasafe.dev` 2026-05-13 and `api.datasafe.dev` 2026-05-14). External self-hosted Pryv.io cores on older versions will receive raw `410` on update calls — caller's responsibility.

### Wire-format change (composite access ids)

After Plan 66, once an access has been updated, its `id` serialises as composite `<base>:<serial>` (`abc:1`, `abc:2`, …). Never-updated accesses still serialise as bare cuids — backward-compatible read path. Equality comparisons against `access.id` must canonicalise via base extraction; see `Contact.eventIsFromContact` for the in-lib example.

### Changed

- **`bridgeAccess.getOrCreateAccess` (Phase 4b)** — `updateIfDifferent && !permissionsMatch` now calls `connection.updateAccess(existing.id, …)` instead of recreating the access. Preserves `apiEndpoint` + `token`. `BridgeAccessResult` exposes `updated: boolean` in place of `recreated`. On `StaleAccessIdError`, refetches and retries once before propagating.
- **`CollectorClient.acceptUpdate` (Phase 4c)** — replaces the delete+create branch with a single `accesses.update`. The `response/collector-v1` `update-accept` event written to the doctor's inbox no longer carries `apiEndpoint`. Same one-retry-budget on `StaleAccessIdError`.
- **`Collector.checkInbox` (Phase 4d)** — `update-accept` events are now read as ack-only. Opportunistically migrates legacy events carrying `apiEndpoint` via `events.update` (drops the field). Idempotent; non-fatal on write failure.
- **`Contact.eventIsFromContact` (Phase 4f)** — base-aware equality via `parseAccessRef(x).base`. An event with bare `modifiedBy: "abc"` now matches an access with composite `id: "abc:3"` (and vice versa). Legacy `previousAccessIds` chain check is also base-aware.
- **`CollectorInvite.checkAndGetAccessInfo` (Phase 4a)** — drops the manual `#accessInfo` short-circuit and the `forceRefresh` parameter. Delegates to pryv@3.1.0's `Connection.accessInfo()` cache. The `invalid-access-token` → `revokeInvite` side-effect is preserved.
- **Defensive: strip non-canonical permission fields before `accesses.update`** — Plan 66's server schema is strict on update (rejects `defaultName` / `name` extras present in `accesses.checkApp` responses). `bridgeAccess.ts` strips these before sending.

### Preserved (historical-data read compatibility)

- **`previousAccessIds` chain** — new code never writes `clientData.hdsCollectorClient.previousAccessIds` / `clientData.previousAccessIds`. Existing chains stay intact so `Contact.eventIsFromContact` continues to attribute events authored by ancestor (pre-recreate) accesses.
- **Legacy `response/collector-v1` events** carrying `apiEndpoint` (Plan 27-era) are read as ack-only + opportunistically rewritten — see Phase 4d.

### Notes for consumers

- `Connection.accessInfo()` cache is **per-`Connection` instance**, not per-apiEndpoint. Server-side handlers that build a fresh `Connection` per request gain nothing.
- `Connection.updateAccess(id, changes)` translates server-side `409 stale-resource` into a typed `StaleAccessIdError` (exported on the top-level pryv namespace). No auto-retry — callers refetch + reapply.

## [0.10.1] - 2026-05-01

### Fixed
- **`eventToShortText` / `formatDatasource`** — generalized so newly added datasource-search items (`treatment/coded-v1` with `regimen`, `procedure/coded-v1` with `procedure`) produce a clean human label instead of a raw JSON dump. The function now resolves the coded value across known shapes (`drug` / `regimen` / `procedure`) and falls back to the first object property carrying a `label`. Appends `×count` when count > 1, the first 1–2 `findings[].label` entries (procedure), and a truncated `notes` string. Existing medication intake (`doseValue` + `doseUnit` + `route`) handling preserved; all 50 existing tests still pass.

## [0.10.0] - 2026-04-30

### Added (plan 46 — context-via-substream resolution + new public API)
- **`HDSModelItemsDefs.forEvent()`** — when no direct `(streamId, eventType)` match is found across `event.streamIds`, falls back to walking parents from `event.streamIds[0]` looking for a registered itemDef with the matching eventType. Closest ancestor wins. Lets a single itemDef registered at e.g. `treatment` resolve events placed at `treatment-fertility`, `treatment-oncology`, … without per-domain item definitions. Reuses the existing `streams.getParentsIds` chain helper consumed by `HDSModelAuthorizations`.
- **`HDSItemDef.eventTemplate({ context })`** — optional `context` streamId per Plan 46 §2.1 (D3). Validates context is `itemDef.streamId` or a descendant; emits length-1 `streamIds: [context ?? streamId]`. Throws on context outside the itemDef's subtree.
- **`HDSItemDef` constructor takes optional `model: HDSModel`** — used by `eventTemplate` to validate descendant streamIds via `model.streams.getParentsIds`. Backward-compatible: callers that build `HDSItemDef` directly without the model still work; they just can't use the `context` option.
- **`HDSModel.loadFromObject(data, overload?)`** — loads model from an in-memory object, skipping `fetch`. Useful for tests, embedded apps, or environments where `fetch` can't reach the model URL (e.g. Node's `fetch` does not yet implement `file://`). `load()` is reimplemented in terms of `loadFromObject`.

### Notes
- D3's walk-up is the third application of the same closest-ancestor algorithm in this lib: Plan 45's `resolveStream.ts` (account-level `clientData` lookup) and `HDSModelAuthorizations` (parent-covers-child de-dup) are the existing precedents. D3 applies the algorithm at the data-model itemDef layer.
- 11 new `[CTXR]` tests in `tests/contextResolution.test.js` exercising the resolution + creation paths plus the legacy multi-streamId case.

## [0.9.1] - 2026-04-28

### Fixed — `CollectorRequestSection` round-trip for `customFieldKeys[]`

`CollectorRequestSection` lacked a `customFieldKeys` field, so the section's reference into `request.customFields[]` was lost on serialize/deserialize. Added private `#customFieldKeys` plus public `customFieldKeys` getter, `setCustomFieldKeys(keys)` and `addCustomFieldKey(key)` setters, parsing in `setContent()` and serialization in `getData()`. Discovered during Phase 6 mcp-chrome smoke test — a template uploaded via `loadTemplate()` had its custom fields surfaced on the request but the per-section pointers dropped.

## [0.9.0] - 2026-04-28

### Added — custom fields & template loader (45-custom-fields-appTemplates Phase 3 + 3.5)

#### Type definitions
- `ts/appTemplates/customFieldTypes.ts` — `HDSCustomField`, `HDSCustomFieldDef`,
  `CustomFieldEventType` (`note/txt | note/html | count/generic | date/iso-8601 | activity/plain`),
  `EmptyDef`, `isEmptyDef()` predicate.
- `ts/appTemplates/systemFeatureTypes.ts` — `HDSSystemFeature`, `HDSSystemAlertDef`,
  `HDSSystemAckDef`, `SystemMessageType`.
- `ts/appTemplates/templateTypes.ts` — `AppTemplate`, `AppTemplateSection`,
  `CustomFieldDeclaration`, `ExistingStreamRef` (canonical home), `StreamPermission`.

#### Resolver helpers (`ts/appTemplates/resolveStream.ts`)
- `resolveStreamCustomField(streamTreeOrMap, streamId, eventType): HDSCustomFieldDef | null`
- `resolveStreamCustomFieldDetailed(...): { kind: 'def' | 'optOut' | 'none', def? }`
- `resolveStreamSystemFeature(...) / resolveStreamSystemFeatureDetailed(...)` — same for `hdsSystemFeature[messageType]`.
- `streamCustomFieldToVirtualItem(...) → VirtualItemDef | null` — convenience for the form engine.
- `customFieldDeclarationToVirtualItem(decl) → VirtualItemDef` — compose-time conversion (no streamTree).
- `buildStreamMap(streamTree)` — pre-built id→stream map for repeated lookups.
- `VirtualItemDef.eventTemplate()` returns `{ streamIds, type }` so the result slots into
  hds-forms-js's `formDataToActions` / `prefillFromEvents` pipeline directly.

Inheritance: parent-chain walk, empty `{}` def = explicit opt-out, missing = keep walking,
root reached = `none` (per design spec §2.4).

#### Template loader (`ts/appTemplates/loader.ts`)
- `loadTemplate(json) → AppTemplate` — Ajv schema validation + cross-field rules
  (sandbox prefix, def self-identification, key/streamId suffix consistency,
  section refs, mode-2/mode-3 collision).
- `loadTemplateFromUrl(url)` — fetch + load.
- Type guards: `isCustomFieldDeclaration`, `isExistingStreamRef`.
- `ts/appTemplates/schemas/appTemplate.schema.json` — JSON-Schema draft-07 covering
  the full template shape.

#### `CollectorRequest` (`ts/appTemplates/CollectorRequest.ts`)
- New top-level field `customFields: CustomFieldDeclaration[]` (Plan 45 §2.9 mode-2).
- `addCustomField(cf)` validates eventType, def.version, sandbox prefix
  (`streamId.startsWith(def.templateId + '-')`).
- `content` getter serializes `customFields[]` when non-empty.
- `setContent` parses `customFields[]` from incoming content.

#### `CollectorClient.accept()`
- New Mode-2 provisioning block: for each `customFields[i]`, creates the
  `${templateId}-custom` parent (idempotent on `item-already-exists`) plus the
  per-field child stream carrying `clientData.hdsCustomField[<eventType>] = def`.
  Appends `contribute` permission to the granted access. Sandbox prefix
  re-checked (defence in depth).

#### Documentation (Phase 3.5)
- `ts/appTemplates/CUSTOM-FIELDS-AND-SYSTEM.md` — canonical developer/agent
  reference covering both halves end-to-end (12 sections: conceptual overview,
  `clientData.hdsCustomField` schema with worked example, `clientData.hdsSystemFeature`
  schema, parent-chain inheritance, validator behaviour, naming convention is
  soft, helper API, three stream-reference modes, bridge/export discoverability,
  no-promotion principle, failure modes, cross-references).
- `AGENTS.md` — cross-link to the new doc.

#### Tests
- `tests/resolveStream.test.js` — 17 tests (parent-chain walk, opt-out semantics,
  StreamMap optimization, system-feature resolution, virtual-item conversion).
- `tests/loader.test.js` — 18 tests (Ajv shape validation, all six cross-field rules,
  type guards).
- `tests/apptemplatesRequest.test.js` — +8 customFields tests (parse, serialize,
  sandbox enforcement, eventType validation, round-trip).

**Net: 43 new tests, all passing. 1 pre-existing failure unchanged.**

#### Form-engine alignment
- `VirtualItemDef.data.type` uses form-engine type names (`'text' | 'select' | 'number' | 'date'`)
  so the result is directly consumable by `<HDSFormField>`.
- `data.options` reshaped to `Array<{ value, label: { en } }>` matching `<Select>`.

#### Public surface (`ts/appTemplates/appTemplates.ts`)
Added barrel exports: `isEmptyDef`, `loadTemplate`, `loadTemplateFromUrl`,
`isCustomFieldDeclaration`, `isExistingStreamRef`, `buildStreamMap`,
`resolveStreamCustomField{Detailed}`, `resolveStreamSystemFeature{Detailed}`,
`streamCustomFieldToVirtualItem`, `customFieldDeclarationToVirtualItem`,
plus all new types.

### Dependencies
- Added `ajv ^8.20.0` for template JSON validation.

### Build
- `tsconfig.json` — `resolveJsonModule: true` for the schema import.

## [0.8.0] - 2026-04-28

### Added — Plan 45 Phase 3a (system stream MVP slice)

#### `CollectorRequest` (`ts/appTemplates/CollectorRequest.ts`)
- New top-level field `existingStreamRefs[]` (Plan 45 §2.9 mode-3): request access on pre-existing streams without provisioning. Each ref carries `{ streamId, permissions: ('read'|'manage'|'contribute')[], purpose? }`.
- New methods: `addExistingStreamRef(ref)` with input validation (rejects non-string streamId, empty permissions, unknown permission levels) and `existingStreamRefs` getter.
- `content` getter now serializes `existingStreamRefs[]` when non-empty (omitted otherwise — backwards-compatible).
- New exported type: `ExistingStreamRef`.

#### `CollectorClient` (`ts/appTemplates/CollectorClient.ts`)
- `accept()` now processes `requestData.existingStreamRefs[]` after the existing chat-stream block:
  1. **Bootstrap-provision** `app-system` / `app-system-out` / `app-system-in` streams if a ref points at the system pair and the streams don't exist yet. The new streams carry `clientData.hdsSystemFeature` declaring `message/system-alert` (on `out`) and `message/system-ack` (on `in`). Idempotent — `item-already-exists` errors from `streams.create` are tolerated.
  2. Append the requested permissions to the access being granted.
  3. Surface system-stream wiring on `responseContent.system = { streamOut?, streamIn? }` when `app-system-*` refs are present.

#### `CollectorInvite` (`ts/appTemplates/CollectorInvite.ts`)
- New properties: `hasSystem`, `systemSettings` (returns `{ streamOut?, streamIn? }`).
- New methods (mirroring `chatPost` / `chatEventInfos`):
  - `systemPostAlert({ level, title, body, ackRequired?, ackId? })` — posts a `message/system-alert` to `streamOut`. Auto-generates a UUID `ackId` when `ackRequired: true` and none supplied.
  - `systemPollAcks({ ackId?, limit? })` — fetches `message/system-ack` events from `streamIn`, optionally filtered by `ackId`. Returns events sorted ascending by creation time.
  - `systemEventInfos(event)` — identifies the source of a system event (`'me'`/`'user'`/`'unknown'`).

### Changed — `package.json.exports.import` → TS source (Plan 49)
- `exports[.].import` switched from `./js/index.js` (compiled JS) to `./ts/index.ts` (TS source). Added wildcard `./js/*` subpath export. `default` still points at compiled JS for non-Vite/CJS consumers.
- This brings hds-lib in line with `_claude-memory/conventions.md § Package exports: TS source for bundlers` and is the prerequisite for live cross-repo dev (the previous `js/index.js` import path created duplicate-singleton bugs when downstream libs like hds-forms-js re-imported `hds-lib` via `require()`). See `_plans/49-local-dev-dependency-graph-done/PLAN.md` for the full rationale.

### Notes
- The Plan-45 Phase 3a additions are the **MVP slice** of system-stream support. Full Phase 3 work (custom-fields helpers `resolveStreamCustomField` + `streamCustomFieldToVirtualItem`, the appTemplates loader with Ajv schema, sandbox-prefix enforcement) lands in a follow-up commit.
- Designed to be consumed by:
  - **`doctor-dashboard`** Phase 6a — operator UI calling `invite.systemPostAlert(...)` and `invite.systemPollAcks(...)`.
  - **`hds-webapp`** Phase 7a — patient-side inbox provisioning the `app-system/*` streams at boot (or relying on `CollectorClient`'s bootstrap fallback) and rendering alerts with an Acknowledge button that posts `message/system-ack`.
- Requires `data-model` ≥ 1.4.0 (the new `message/system-alert` + `message/system-ack` event types).
- See `_plans/45-custom-fields-appTemplates-paused/spec.md` for the locked design.

## [0.7.2] - 2026-04-28

### Added — runtime support for `deprecated: true` itemDefs (Plan 50)
- `HDSItemDef.isDeprecated` getter — `true` when the underlying itemDef has `deprecated: true` in pack.json (set in `data-model` ≥ 1.5.0).
- `HDSModel.itemsDefs.getAllActive()` — returns every itemDef except deprecated ones. Use this for any UI that lets a user create new data points (form builder item browsers, item picker sheets, the data-model browser default listing).
- `getAll()`, `forKey()`, `forEvent()` are unchanged: they still return deprecated items so existing events remain readable / renderable.

Tests: `[MDPX]` block in `tests/hdsModel.test.js` — covers the getter on the three currently-flagged items (`body-vulva-mucus-stretch`, `body-vulva-wetness-feeling`, `fertility-cycles-charted-count`), the contrast with non-deprecated items, and the `getAllActive` vs `getAll` invariant.

Contract documented in `data-model/AGENTS.md § "deprecated: true on items"`.

## [0.7.1] - 2026-04-28

### Changed — `package.json.exports.import` now points at TS source (Plan 49)
- `exports[.].import` switched from `./js/index.js` (compiled JS) to `./ts/index.ts` (TS source).
- Added wildcard subpath export `./js/*` (was already `./ts/*`) for completeness.
- `default` export still points at `./js/index.js` for non-Vite/CJS consumers.

**Why.** Vite resolves the `import` condition in dev mode. With `import` pointing at compiled JS, live edits to `ts/*.ts` weren't reflected in npm-linked consumers without rebuilding hds-lib-js. Pointing `import` at TS source enables true live cross-repo development. This also avoids the duplicate-singleton bug surfaced by Plan 45 (a downstream lib's pre-built bundle inlining a second copy of `hds-lib`'s `HDSModel`). Production builds and CJS consumers are unaffected (still hit `default`).

Brings `hds-lib` in line with `_claude-memory/conventions.md § Package exports: TS source for bundlers`. See `_plans/49-local-dev-dependency-graph-done/PLAN.md` for the full rationale.

## [0.7.0] - 2026-04-27

### Added — itemLabels (per-form label overrides) module
- `appTemplates.collectItemLabels(itemKey, contacts)` — gathers label overrides for an item across every active CollectorClient, attributing each entry to its source contact + form. Pure data layer; usable by any patient/diary surface, not just the form renderer.
- `appTemplates.collectItemLabelsFromSections(itemKey, sources, opts?)` — lower-level helper for callers that already have section objects.
- `appTemplates.getSectionItemLabels(section, itemKey)` — read labels for one item out of one section.
- New types: `ItemLabels`, `ItemCustomization`, `ItemLabelSource`, `ItemLabelsWithSource`, `CollectItemLabelsOptions` (mirror the `section.itemCustomizations[itemKey].labels` shape; previously duplicated as inline interfaces in hds-forms-js).
- Tests: `tests/itemLabels.test.js` (deduplication, requireLabels gating, options-map preservation, source attribution).

### Changed — eventToShortText handles slider items
- `eventToShortText` now formats `type: 'slider'` events using the item def's `slider.display` block (`multiplier`, `precision`, `suffix`). EQ VAS storing `0.73` now renders as `"73 /100"` everywhere events are summarised (diary card, timeline tooltips, etc.). Previously fell through to the generic number path and read `"0.73"`.

### Added
- `HDSModelOverload` — apps can extend the shared HDS data-model at init time with their own itemDefs, streams, eventTypes, settings, datasources, or appStreams, plus refine translations and default `repeatable` values.
  - `HDSModel.load(url, overload?)` — merges the overload (after policy validation) before freezing.
  - `initHDSModel({ overload })` — same hook on the singleton init.
  - `extractOverloadAsDefinitions(overload)` — converts an overload back into a `{ filepath: content }` map matching the layout under `data-model/data-model/definitions/`, so apps can dump their overload to disk and open a PR upstream. Browser-safe (no `fs`).
  - Forbidden mutations (changing `parentId` of an existing stream, `type`/schema of an existing eventType, `type`/`streamId`/`eventType` of an existing item, etc.) throw `HDSLibError` listing every violation.

## [0.5.0] - 2026-04-02

### Added
- `Contact.incomingCollectorClients` getter — filter CollectorClients by Incoming status
- `Contact.displayStatus` mapping: Deactivated → Revoked, Incoming → Pending
- `Collector.requestAccessUpdate()` — doctor-side method to request permission changes from patient
- `CollectorClient.checkForUpdateRequests()` — patient-side discovery of pending update requests
- `CollectorClient.acceptUpdate()` / `refuseUpdate()` — patient-side accept/refuse with access recreate
- `AppClientAccount.getContacts()` scans active CCs for update requests in parallel
- Bridge access helpers: `getOrCreateBridgeAccess()`, `recreateBridgeAccess()`, `ensureBridgeAccess()`

### Fixed
- `CollectorClient.revoke()` handles missing accessData gracefully (skips access deletion)
- `AppManagingAccount.getContacts(true)` calls `checkInbox()` on each collector to detect patient revoke/refuse responses
- `requestAccessUpdate` target key uses doctor's sharing access ID (not patient-side access info)

## [0.3.0] - 2026-03-23

### Added
- Unified preferred representation API (`HDSModel-Preferred.ts`)
  - `getPreferredInput(itemKey)` / `getPreferredDisplay(itemKey)` — works for both variation and converter items
  - Standalone functions exported from lib
- Dynamic settings with prefix pattern: `preferred-display-{itemKey}`, `preferred-input-{itemKey}`
  - Stored as individual Pryv events (`settings/preferred-display`, `settings/preferred-input`)
  - `HDSSettings.setDynamic()` / `getDynamic()` API
- `_raw` virtual method auto-generated from dimension stops at converter engine load
- `resolveObservationLabel()` — localized labels from method definitions for converter results
- `HDSSettings._testInject()` / `_testClear()` for test-only settings injection
- `formatEventDateTime()` — date+time for checkbox events (skips time if midnight)
- test-result/scale formatting: Positive/Negative/Indeterminate + percentage (localizable)
- 12 preferred API tests, 15 convertible shortText tests

### Changed
- Convertible event content: `data` → `vectors` for clarity (Plan 22)
- eventToShortText convertible display: `sourceData (Method Name)` format
- autoConvert display: `result (target <- source %)` with confidence percentage
- `HDSSettings.get()` now checks dynamic settings first
- Renamed settings prefixes: `converter-auto-` → `preferred-display-`, `converter-default-` → `preferred-input-`

## [0.2.0] - 2026-03-19

### Added
- Euclidian-distance converter engine (`EuclidianDistanceEngine`) for cross-method vector conversion
- `HDSModelConverters` on HDSModel with async lazy-load from `{modelBaseUrl}/converters/{itemKey}/pack-latest.json`
- `convertMethodToEvent()`, `convertEventToMethod()`, `convertMethodToMethod()`
- Converter-aware shortText formatting with `autoConvert-{itemKey}` setting support
- `modelUrl` getter on HDSModel
- 32 converter engine tests

## [0.1.15] - 2026-03-13

### Fixed
- Pryv CJS interop: declaration merging for type+value exports

### Changed
- HDSProfile: graceful fallback when connection lacks profile access
- Added `getAttachmentUrl` toolkit utility, fixed avatar URL in HDSProfile

## [0.1.14] - 2026-03-12

### Changed
- Converted library from CJS to ESM output (`"type": "module"`)
- TS-first: import `.ts` directly, tests run from source (Node 24)
- Updated CI matrix to test Node 22.x + 24.x
- Bumped Node engine to `>=24`

### Added
- HDSSettings singleton for managing user settings as individual Pryv events
- Unit-aware formatting with settings integration
- `formatEventDate` helper with HDSSettings `dateFormat` hook
- `eventToShortText` shared event formatter replacing duplicated formatters across apps
- Reminder system: `computeReminders`, duration utilities, `lastEventContent`
- `MonitorScope`: progressive paged event loading with Monitor integration
- `datasets://` protocol resolution for datasource endpoints
- HDSModelDatasources support

### Fixed
- Renamed setting event types to kebab-case for Pryv API compatibility
- Fixed datasets URL to `demo-datasets.datasafe.dev`
- Fixed lint errors and `formatEventDate` test bug

## [0.1.13] - 2026-01-28

### Added
- Chat feature support: `hasChatFeature`, chat logic components
- Stream tools: `getChildrenStreamIds`, `streamTools`
- Custom setting unit support

### Changed
- Updated Pryv dependencies

## [0.1.12] - 2026-01-23

### Added
- Event type definitions to model

## [0.1.11] - 2025-12-03

### Changed
- Migrated source to TypeScript
- Reorganized source file structure
- Removed trailing `.js` in imports/require
- Set proper types in `package.json`

### Fixed
- Various type fixes and null handling for `clientData`

## [0.1.10] - 2025-10-13

### Changed
- Handling of new variations model
- Added `getAll` for itemDefs

### Fixed
- Avoided infinite loops and error handling on reset

## [0.1.9] - 2025-09-18

### Added
- `CollectorRequest` class with sections, fencing, and permission building
- Collector ordering API, `itemCustomizations`, and repeatable getter

### Fixed
- Corrected linting issues
- Fixed two test failures

## [0.1.8] - 2025-08-27

### Added
- `getHDSModel()` singleton accessor
- Lazily loaded type definitions
- Type declaration files

### Changed
- Updated Pryv library
- Improved type exports

## [0.1.7] - 2025-08-01

### Fixed
- Fixed `itemDefs.eventTemplate` handling
- Fixed `getCustomSettings` and cache validity

### Added
- `setCustomSettings` support
- `items.eventTemplate` accessor

## [0.1.6] - 2025-07-24

### Changed
- Refactored model singleton logic

## [0.1.5] - 2025-07-23

### Added
- Comprehensive documentation (README)

## [0.1.4] - 2025-07-17

### Added
- Localized labels and descriptions for items
- Browser test suite
- Self-revoke capability for invites
- Revoke and refuse actions for invites

### Changed
- New model singleton pattern
- Refactored test suite for better coverage

## [0.1.3] - 2025-07-08

### Added
- Pryv bundled into HDSLib
- Localization and title for requests
- `getInviteByKey` and `getCollectorById` accessors

### Fixed
- Active state of `CollectorClient`

## [0.1.2] - 2025-06-27

### Added
- Application Client Account support
- Sharing capabilities
- Manager account creation
- Collectors and App Templates implementation

### Changed
- Factorized apps module
- Implemented `apiOne()` where possible
- Consolidated Collector into a single file
- Refactored model streams into separate files

## [0.1.1] - 2025-06-18

### Added
- `authorizationForItemKeys` method
- Authorization building methods
- Basic stream manipulations
- `HDSItemDef` class with maps

### Changed
- Renamed `.types` to `.eventTypes`

## [0.1.0] - 2025-06-06

### Added
- Initial release
- HDS data model loading and parsing
- Item definitions with keys
- Web-packed browser library
- Source maps for debugging
