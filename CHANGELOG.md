# Changelog

## [Unreleased]

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
