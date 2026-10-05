# Data-set templates (`hds-dataset.json`)

An app that writes health data to HDS can publish **the scope of the data it collects** as a
JSON file. A data-collection tool (e.g. the HDS doctor dashboard) imports that file from its URL
to create a data set, re-checks it for changes, and turns it into an invite link for patients.

The format is an [AppTemplate](./app-templates.md) with publication fields. Every data-set
template is a valid AppTemplate, and the same loader validates both.

## Example

```json
{
  "$schema": "https://healthdatasafe.github.io/hds-lib-js/schemas/appTemplate.json",
  "format": "hds-dataset-template",
  "formatVersion": 1,
  "id": "cycle-app",
  "version": "1.0.0",
  "publishedAt": "2026-10-05",
  "app": {
    "id": "cycle-app",
    "name": { "en": "Cycle App" },
    "publisher": "Example Clinic",
    "url": "https://example.org/cycle-app/",
    "contact": "mailto:support@example.org"
  },
  "title": { "en": "Cycle chart" },
  "description": { "en": "Daily fertility-awareness log" },
  "consent": { "en": "I share my chart read-only with my practitioner." },
  "chat": true,
  "sections": [
    {
      "key": "daily", "type": "recurring", "name": { "en": "Daily observations" },
      "itemKeys": ["body-temperature-basal", "body-vulva-bleeding", "body-vulva-mucus-inspect"],
      "itemCustomizations": {
        "body-temperature-basal": { "repeatable": "P1D", "required": true }
      }
    }
  ],
  "existingStreamRefs": [
    { "streamId": "cycle-app-notes", "permissions": ["read"], "purpose": "app-private", "label": { "en": "Daily notes" } }
  ],
  "requiredBridges": []
}
```

JSON Schema: <https://healthdatasafe.github.io/hds-lib-js/schemas/appTemplate.json> (rolling) — pinned per release at
`https://healthdatasafe.github.io/hds-lib-js/v<version>/schemas/appTemplate.json`. Point `$schema` at it
so editors validate the file as you write it.

## Fields

| Field | Required | Meaning |
|---|---|---|
| `format` | yes (for a data-set template) | `"hds-dataset-template"`. Once set, `formatVersion`, `version` and `app` are required. |
| `formatVersion` | yes | `1`. The version of this format. It changes only if the format itself breaks. |
| `version` | yes | Semver of **this file's content** — see [Versioning](#versioning). |
| `publishedAt` | no | ISO date of this content version. |
| `app` | yes | `{ id, name, publisher, url (https), contact?, appVersion? }` — who publishes the data. |
| `id`, `title`, `description`, `chat` | yes | As in any AppTemplate. |
| `sections[]` | yes | `type: "permanent"` (set once, profile-like) or `"recurring"`; `itemKeys` are [data-model](https://model.datasafe.dev) item keys. |
| `sections[].itemCustomizations[itemKey]` | no | Cadence and presentation per item: `repeatable` (`once` \| `any` \| `unlimited` \| ISO-8601 duration such as `P1D`), `reminder`, `labels`, `required` (boolean). |
| `consent` | no | The consent text the app proposes; the data-set owner may edit it. |
| `existingStreamRefs[]` | no | Streams outside the data-model. For the app's own data use `purpose: "app-private"`, `permissions: ["read"]` and a `label` (the stream id may start with the template `id`): the importer requests `read` on them (named by `label`) and shows them as raw events, never as form fields. Any other ref is carried read-only and is not granted by the import. |
| `customFields[]` | no | As in any AppTemplate (template-sandboxed streams). |
| `requiredBridges[]` | no | Bridges the data set expects (e.g. `bridge-mira`). |
| `dataModel.publicationDate` | no | Informational: the model pack the file was written against. |

Item keys are resolved against the live data-model when the file is imported: unknown,
deprecated and system keys are reported to the data-set owner, never dropped silently.

## Versioning

- **major** — the scope narrows or a grant changes: an item removed, an item moved between a
  permanent and a recurring section, a custom field removed, an existing-stream ref added, removed
  or with other permissions. Patients who consented to the old scope no longer match it.
- **minor** — additive: items or custom fields added; cadence (`repeatable`, `reminder`, `required`)
  changed.
- **patch** — texts only: titles, descriptions, consent, section names, item labels, license, app
  identity, or an item moved between sections of the same type.

Importers do not rely on the bump alone: `templateScopeHash` fingerprints the scope (items with
their section type and cadence, custom fields, refs with permissions — not texts), and
`diffTemplateScope` reports the bump a change requires and whether the file is **under-bumped**.

## Hosting

Serve the file over **HTTPS** with `Access-Control-Allow-Origin: *`, a short `Cache-Control`
(minutes), no authentication, and keep it under 256 KB. Convention: `<app base URL>/hds-dataset.json`.
A root-hosted app may also serve it at `/.well-known/hds-dataset.json`. GitHub Pages works as is.

## Security model

The file grants nothing. Permissions are always derived by the importer: from the item keys through
the data-model (level `read`), plus `read` on `app-private` refs; every ref is capped at `read`;
nothing is accessible until a patient accepts an invite. Importers validate the file (schema with `additionalProperties: false`,
cross-field rules, size cap, https only) and render every text as plain text.

## API (`appTemplates`)

```js
import { appTemplates } from 'hds-lib';

// fetch + validate (https only, 8 s timeout, 256 KB cap, no credentials, no cache)
const tpl = await appTemplates.loadTemplateFromUrl('https://example.org/cycle-app/hds-dataset.json');

// provenance + FormSpec (permissions derived from the data-model)
const source = await appTemplates.templateSource(tpl, url);
const { formSpec, itemKeyIssues } = appTemplates.templateToFormSpec(tpl, { source });

// later: has the published scope changed?
const latest = await appTemplates.loadTemplateFromUrl(formSpec.source.url);
if (await appTemplates.templateScopeHash(latest) !== formSpec.source.scopeHash ||
    latest.version !== formSpec.source.version) {
  // what applying `latest` would change in the data set (owner's edits included);
  // `underBumped` = scope changed while `version` stayed the same
  const diff = await appTemplates.diffFormSpecWithTemplate(formSpec, latest);
  // diff.added / removed / typeChanged / cadenceChanged / breaking / requiredBump / underBumped
}
// two template versions: appTemplates.diffTemplateScope(prevTemplate, nextTemplate)
```

`loadTemplateFromUrl` errors are `HDSLibError` with `innerObject.reason` one of `url`, `network`,
`timeout`, `http`, `too-large`, `json` (schema and cross-field errors carry the validator output).

## Permanent invite link

A data set can carry one **open-link** CMC invite without expiry
(`createInviteWithFormSpec({ mode: 'open-link', expiresAt: null, … })`, stored as
`formSpec.openLink`). The app can embed that link statically (runtime configuration, not code) so
its users can share their data with that practitioner. It stays valid until the data-set owner
regenerates it (`cmc.invalidateCapability`). Requires a core on 2.0.0-rc.21 or later; an older core
mints a 7-day link instead, so check `expiresAt === null`.
