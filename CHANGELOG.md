# Changelog

## [Unreleased]

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

Brings `hds-lib` in line with `_claude-memory/conventions.md § Package exports: TS source for bundlers`. See `_plans/49-local-dev-dependency-graph-study/PLAN.md` for the full rationale.

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
