This document is part of [Generic toolkit for server and web applications](README.md).

# APPLICATION TEMPLATES

Short API reference for `appTemplates` and the CMC helpers. The full guide, with the doctor and patient flows and examples, is [docs/app-templates.md](docs/app-templates.md) (published at <https://healthdatasafe.github.io/hds-lib-js/app-templates>). Data-set templates (`hds-dataset.json`) are in [docs/dataset-templates.md](docs/dataset-templates.md).

Since 1.0.0 the consent flow runs on CMC (`@pryv/cmc`, re-exported as `cmc`). `Collector`, `CollectorInvite`, `CollectorClient`, `AppManagingAccount.createCollector` and `AppClientAccount.handleIncomingRequest` no longer exist; see the 1.0.0 entry of [CHANGELOG.md](CHANGELOG.md).

## Application, AppManagingAccount, AppClientAccount

`AppManagingAccount` (doctor side) and `AppClientAccount` (patient side) extend `Application` and add nothing else.

- `App*.newFromApiEndpoint(baseStreamId, apiEndpoint, appName?, features?)`
- `App*.newFromConnection(baseStreamId, connection, appName?, features?)`

Both return an initialized instance: the access is checked (`personal`, or `app` with `manage` on `*` or on `baseStreamId`) and `applications/<baseStreamId>` is created when missing. `appName` is required for `AppClientAccount`; `AppManagingAccount` takes it from the access info. `features.streamsAutoCreate` (default `true`) attaches `toolkit.StreamsAutoCreate` to the connection.

- `app.connection`, `app.baseStreamId`, `app.appName`, `app.streamData`
- `await app.loadStreamData()`
- `await app.getCustomSettings(forceRefresh?)`, `await app.setCustomSettings(content)`, `await app.setCustomSetting(key, value)` (`null` deletes the key)

## CollectorRequest

Editor state of a data request (used by FormBuilder UIs). No I/O.

- `new CollectorRequest(content)`, `request.setContent(content)`, `request.content`
- Texts: `title`, `description`, `consent` (`localizableText` or a plain string, stored as English), `requesterName`, `appId`, `appUrl`, `appCustomData`
- Sections: `createSection(key, 'permanent' | 'recurring')`, `getSectionByKey(key)`, `moveSection(key, toIndex)`, `removeSection(key)`, `sections`, `sectionsData`
- Section: `setName(text)`, `setNameLocal(lang, name)`, `addItemKey(key)`, `addItemKeys(keys)`, `removeItemKey(key)`, `moveItemKey(key, toIndex)`, `setItemCustomization(key, data)`, `getItemCustomization(key)`, `setCustomFieldKeys(keys)`, `addCustomFieldKey(key)`, `getData()`
- Permissions: `buildPermissions()` (from section item keys plus `permissionsExtra`), `addPermission(streamId, defaultName, level)`, `addPermissions(list)`, `addPermissionExtra({ streamId, defaultName?, level? })`, `resetPermissions()`, `permissions`, `permissionsExtra`
- Chat: `addChatFeature(settings?)` (`{ type: 'user' | 'usernames' }`, or `true` / `false`), `hasChatFeature`, `features`
- `addExistingStreamRef(ref)`, `existingStreamRefs`, `addCustomField(declaration)`, `customFields`
- Questionnaires: `addQuestionnaire(q)`, `questionnaires`, `getQuestionnaire(i)`, `removeQuestionnaire(i)`, `checkQuestionnaireCoverage(q)`, `applyQuestionnaireCoverage(q)`

## Questionnaire

- `new Questionnaire(content?)`, `addQuestion(key, def)`, `removeQuestion(key)`, `getQuestion(key)`, `questionKeys`, `questions`, `toRequestEventContent()`
- `Questionnaire.fromRequestEvent(event)`, `Questionnaire.makeRequestEvent(content, streamIds, time?)`, `Questionnaire.writeBundled(connection, request, streamIds, opts?)`, `Questionnaire.buildAnswerEvent(requestEventId, answers, knownKeys?)`
- `appTemplates.checkQuestionnaireCoverage(q, request)`

## CMC FormSpec helpers (`cmcFormSpec`, `cmcAppScope`, `cmcConstants`)

Doctor side:

- `cmcAppScope.ensureAppScope(connection, appCode, subPath?)`
- `cmcFormSpec.saveFormSpec(connection, scopeStreamId, formSpec)`, `loadFormSpec(connection, scopeStreamId)`
- `cmcFormSpec.listFormSpecs(connection, opts?)`, `getFormSpecById(connection, collectorId, opts?)`, `eventToFormSpecRecord(event, appCode?)`
- `cmcFormSpec.validateFormSpecItemKeys(formSpec, model?)`, `formSpecFingerprint(formSpec)`
- `cmcFormSpec.createInviteWithFormSpec(connection, params)`, `deriveCmcPermissions(formSpec)`, `isChatOnlyFormSpec(formSpec)`

Patient side:

- `cmcFormSpec.provisionHdsNoop(connection)`
- `cmcFormSpec.readOfferWithFormSpec(capabilityUrl, opts?)` (before `cmc.acceptInvite`)
- `cmcFormSpec.mirrorFormSpecOnAcceptEvent(connection, acceptEventId, formSpec)` (after it)

Constants: `cmcConstants.CMC_APP_CODES`, `CMC_EVENT_TYPES`, `appSubScope(appCode, sub)`, `extractAppSubScopeSuffix(streamId, appCode)`, `cmcFormSpec.FORM_SPEC_EVENT_TYPE`, `HDS_NOOP_STREAM_ID`, `HDS_NOOP_PERMISSION`.

Data-export requests: `cmcDataExport.requestDataExport`, `fulfillDataExportRequest`, `listDataExportRequests`, `buildDataExportRequestContent`, `parseDataExportEvents`.

## Contact

Patient-side view of CMC relationships, one `Contact` per counterparty.

- `Contact.aggregateCmc(accesses, accepts, patientScopeStreamId)`, `Contact.cmcDetectKind(appCode)`
- Fields: `remoteUsername`, `displayName`, `counterparty`, `kind`, `cmcRelationships`, `accessObjects`
- Getters: `status`, `isActive`, `isPerson`, `hasChat`, `appStreamIds`, `allPermissions`, `accessIds`, `cmcIsActive`, `cmcHasChat`, `cmcChatStreams`, `cmcFormSpecs`, `cmcFormSections`, `cmcAllPermissions`
- Methods: `initStreamCache(streamsById)`, `eventIsAccessible(event)`, `eventIsFromContact(event)`, `chatEventInfos(event)`, `addAccessObject(access)`

## AppTemplate JSON

- `appTemplates.loadTemplate(json)`, `appTemplates.loadTemplateFromUrl(url, opts?)`
- `appTemplates.isCustomFieldDeclaration(value)`, `appTemplates.isExistingStreamRef(value)`
- Data-set templates: `templateToFormSpec`, `templateSource`, `templateScope`, `templateScopeHash`, `scopeHashMatches`, `diffTemplateScope`, `diffFormSpecWithTemplate`, `semverBump`, `withAppPrivatePermissions` (see [docs/dataset-templates.md](docs/dataset-templates.md))

## Overloading the data model

Apps can extend the shared HDS data-model at init time without forking `data-model`. Pass an `HDSModelOverload` to `initHDSModel()`:

```js
import { initHDSModel, extractOverloadAsDefinitions } from 'hds-lib';

const overload = {
  // Add brand new items
  items: {
    'mood-happy': {
      version: 'v1',
      label: { en: 'Happy', fr: 'Heureux' },
      description: { en: 'Feeling happy' },
      streamId: 'mood-happy',
      eventType: 'activity/plain',
      type: 'checkbox',
      repeatable: 'unlimited'
    },
    // Refine an existing item: add a translation, override repeatable
    'body-weight': {
      label: { fr: 'Poids' },
      repeatable: 'P1D'
    }
  },
  // Add new streams (must hang under an existing parent — or be a new root)
  streams: [
    { id: 'mood', name: 'Mood', parentId: null, children: [
      { id: 'mood-happy', name: 'Happy' }
    ]}
  ],
  // App-specific settings, eventTypes, datasources, appStreams also supported
  settings: {
    fontSize: { eventType: 'settings/font-size', type: 'number', default: 14 }
  }
};

await initHDSModel({ overload });
```

The overload is **validated** before merging — attempting to change the `parentId` of an existing stream, the `type`/schema of an existing eventType, or the `type`/`streamId`/`eventType` of an existing item throws `HDSLibError` listing every violation.

To later contribute your overload upstream, dump it to `data-model/data-model/definitions/`-shaped files:

```js
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const files = extractOverloadAsDefinitions(overload);
for (const [path, content] of Object.entries(files)) {
  mkdirSync(dirname(`./out/${path}`), { recursive: true });
  writeFileSync(`./out/${path}`, content);
}
```

Note: runtime overload validation only enforces the policy table (no AJV schema). For full schema validation, run `data-model/data-model/src/schemas/items.js` AJV against your overload at build time.
