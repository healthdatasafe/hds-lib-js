# Custom fields — design reference

This is the canonical developer/agent reference for the `appTemplates` custom-field
extension: **template-private fields stored on namespaced streams**, declared in
`clientData.hdsCustomField` rather than baked into the canonical data model so
templates extend the model without polluting it.

> The companion **system-stream** design (Plan 45 account-level `app-system-out` /
> `app-system-in` with `clientData.hdsSystemFeature`) was removed in plan 64
> Phase A — superseded by the **CMC per-collector system channel**
> (`:_cmc:apps:<app-code>:[<path>:]collectors:<counterparty-slug>`) carrying
> `notification/alert-cmc`, `notification/ack-cmc`, `consent/scope-request-cmc`,
> `consent/scope-update-cmc`. See `open-pryv.io/components/cmc/IMPLEMENTERS-GUIDE.md`.

> Companion reading:
> - `data-model` `documentation/CUSTOM-FIELDS-AND-SYSTEM.md` — validator side

---

## 1. Conceptual overview

### Why custom fields exist

A template may need to capture data points that are not (and should not be)
canonical items. The canonical `data-model/pack.json` is the shared lingua franca
of HDS — adding `study-cohort-id` or `study-coordinator-note` would brand it
with one consumer's vocabulary forever.

Custom fields let a template **provision its own template-private streams** at
acceptance time, declared with everything the form engine and validator need to
treat them as first-class fields *without* a canonical itemDef.

### The "no canonical model branding" principle

Custom fields do not mutate `data-model`'s `pack.json`. The data-model only ships:

- Storage-shape `eventTypes` (`note/txt`, `count/generic`, …)
- Semantic itemDefs that map onto those eventTypes

Templates carry their own typing inline on the streams they provision. The
runtime resolver (`hds-lib-js`) walks the parent chain reading `clientData` —
no naming convention check, no regex on stream ids, no central registry.

### Relationship to Plan 25's `{app-id}-app/` convention

Plan 25 generalised the bridge-side stream layout (`bridge-mira-app-notes`,
`bridge-mira-app-chat`, …). Plan 45 reuses the same idea for **templates**
(`sample-template-custom-flow`).

| Layer       | Convention                          | Example                          |
| ----------- | ----------------------------------- | -------------------------------- |
| Bridge      | `{bridge-id}-app-{suffix}`          | `bridge-mira-app-notes`          |
| Template    | `{template-id}-custom-{key}`        | `sample-template-custom-flow`       |

Naming is **soft / non-load-bearing** — the hyphenated prefixes are conventions
for human readability. The validator and resolver consume `clientData`, never
the streamId.

---

## 2. `clientData.hdsCustomField` schema

Each custom-field-bearing stream carries a single declaration keyed by eventType:

```jsonc
// stream { id: 'sample-template-custom-flow', parentId: 'sample-template-custom', clientData: ↓ }
{
  "hdsCustomField": {
    "note/txt": {
      "version":     "v1",
      "templateId":  "sample-template",
      "key":         "flow",
      "label":       { "en": "Menstrual flow" },
      "description": { "en": "Self-rated daily" },
      "section":     "menstrual",
      "options":     ["light", "medium", "heavy"],
      "required":    true,
      "repeatable":  "P1D"
    }
  }
}
```

| key           | type                                | meaning                                                                            |
| ------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `version`     | `'v1'`                              | Bump on incompatible payload changes.                                              |
| `templateId`  | string                              | Authoring template (matches sandbox prefix).                                       |
| `key`         | kebab-case string                   | Field key inside the template; matches `streamId.endsWith('-' + key)`.             |
| `label`       | `localizableText`                   | UI label.                                                                          |
| `description` | `localizableText`                   | UI helper text.                                                                    |
| `section`     | string                              | Optional section.key the form engine renders this under.                           |
| `required`    | boolean                             | Form-engine required toggle. Storage shape is enforced by eventType, not this.     |
| `maxLength`   | number                              | For `note/txt`, `note/html`.                                                       |
| `options`     | string[]                            | For `note/txt` rendered as `<select>`.                                             |
| `min/max/step`| number                              | For `count/generic`.                                                               |
| `minDate/maxDate` | ISO-8601 string                 | For `date/iso-8601`.                                                               |
| `repeatable`  | Pryv repeatable expression          | `'P1D'`, `'unlimited'`, `'once'`, `'any'`.                                         |

The eventType key (`note/txt`, `count/generic`, etc.) is the **load-bearing dimension**
— a stream may declare multiple custom fields if its parent stream supports
mixed-type events. Templates typically declare exactly one eventType per stream
to keep things simple.

### Worked example — custom-fields snippet

```jsonc
// sample template
{
  "id": "sample-template",
  "customFields": [
    {
      "streamId":  "sample-template-custom-flow",
      "eventType": "note/txt",
      "def": {
        "version": "v1", "templateId": "sample-template", "key": "flow",
        "label": { "en": "Menstrual flow" },
        "options": ["light", "medium", "heavy"]
      }
    },
    {
      "streamId":  "sample-template-custom-pain",
      "eventType": "count/generic",
      "def": {
        "version": "v1", "templateId": "sample-template", "key": "pain",
        "label": { "en": "Pain (0-10)" },
        "min": 0, "max": 10, "step": 1
      }
    }
  ]
}
```

At acceptance the patient's account is provisioned with:
- `sample-template-custom` (parent, idempotent)
- `sample-template-custom-flow` with `clientData.hdsCustomField['note/txt']` = the def
- `sample-template-custom-pain` with `clientData.hdsCustomField['count/generic']` = the def

The requester's access gains `contribute` on each.

---

## 4. Inheritance semantics (parent-chain walk)

A field-def is resolved by walking from a stream up its parent chain. For each
stream visited, the resolver inspects `clientData.hdsCustomField[eventType]`
and applies one of three rules:

| Value on stream         | Outcome                                |
| ----------------------- | -------------------------------------- |
| Non-empty def           | **Use it**, stop walking.              |
| `{}` (empty object)     | **Opt-out**, stop walking.             |
| Missing                 | Keep walking up the chain.             |
| Reached root, no def    | `none` — fall through to canonical lookup. |

### Worked examples

```text
sample-template                        clientData.hdsCustomField['note/txt'] = { …flow def, options: 3 levels }
└── sample-template-custom             (no clientData)
    ├── sample-template-custom-flow    clientData.hdsCustomField['note/txt'] = { …override, options: 4 levels }
    ├── sample-template-custom-quiet   clientData.hdsCustomField['note/txt'] = {}
    └── sample-template-custom-other   (no clientData)
```

| Resolved from                       | Result                          |
| ----------------------------------- | ------------------------------- |
| `sample-template-custom-flow`          | override def (4 levels)         |
| `sample-template-custom-quiet`         | opt-out (resolver returns null) |
| `sample-template-custom-other`         | inherits root def (3 levels)    |
| `sample-template-custom`               | inherits root def (3 levels)    |

`resolveStreamCustomFieldDetailed()` distinguishes the three outcomes via
`{ kind: 'def' | 'optOut' | 'none' }`. The shorter `resolveStreamCustomField()`
collapses opt-out and none to `null` (most callers don't care about the
distinction).

---

## 5. Validator behaviour

The validator (in `data-model/src/items.js`) consults this resolution at
event-write time:

```text
validate(event, streamTree):
  resolved = walkParents(event.streamIds[0], event.type)
  switch resolved.kind:
    'def'        → validate event.content against the eventType's storage schema
    'optOut'     → fall through to canonical lookup (treat as if no decl)
    'none'       → fall through to canonical lookup (today's path)
```

The form-engine constraints carried in the def (`required`, `maxLength`,
`options`, `min/max/step`) are **not** enforced by the data-model validator —
the eventType schema enforces *storage shape* only. UI-level constraints are
the form engine's responsibility (per spec §4 / Plan 45 Q6).

**Failure modes:**
- Missing eventType registration → reject with `eventType-not-found`.
- Def present but payload violates the eventType's storage schema → reject.
- Stream-tree walk circular (defensive guard; should never happen) → reject.

---

## 6. Stream-naming convention is soft / non-load-bearing

The `*-custom-*` infix on template-private streams is a **human-readability
convention**. The validator and resolver:

- Never regex on streamIds.
- Never assume a parent's id from a child's id.
- Always introspect `clientData` to determine typing.

This is intentional — it lets bridges, exports, and future stream traversers
discover template-private content without hardcoding naming rules. The price is
that the loader (`loader.ts`) enforces the naming convention at *load* time as a
sanity guard, not at *runtime*.

---

## 7. Helper API reference

Located in `ts/appTemplates/resolveStream.ts`:

```ts
import {
  resolveStreamCustomField,
  resolveStreamCustomFieldDetailed,
  streamCustomFieldToVirtualItem,
  buildStreamMap
} from 'hds-lib';
```

### `resolveStreamCustomField(streamTreeOrMap, streamId, eventType): HDSCustomFieldDef | null`

Walks the parent chain. Returns the resolved def or `null` (no decl, or
explicit opt-out).

### `resolveStreamCustomFieldDetailed(...): { kind: 'def' | 'optOut' | 'none', def?: ... }`

Use when you need to distinguish opt-out from missing.

### `streamCustomFieldToVirtualItem(streamTreeOrMap, streamId, eventType): VirtualItemDef | null`

Convenience for the form engine. Returns a virtual `ItemDef`-shaped object the
form-field renderer can consume the same way it consumes canonical itemDefs.
`note/txt` with `options[]` is mapped to form-type `'select'`; bare `note/txt`
is mapped to `'note'`. Returns `null` for opt-out and missing.

### `buildStreamMap(streamTree): Map<string, Pryv.Stream>`

Optional optimization — pre-build the id→stream map when resolving many fields
against the same tree. The resolver functions accept either a `Pryv.Stream[]`
tree or a pre-built map.

---

## 8. Three stream-reference modes (§2.9)

A `CollectorRequest` references streams via three orthogonal mechanisms:

| Mode | Source                                | Purpose                                                |
| ---- | ------------------------------------- | ------------------------------------------------------ |
| 1    | `sections[].itemKeys[]`               | Canonical items resolved via `data-model/pack.json`.   |
| 2    | `customFields[]` *(provision-new)*    | Template-private streams created at acceptance.        |
| 3    | `existingStreamRefs[]`                | Access asks on pre-existing streams.                   |

### Mode 2 — sandbox prefix rule

Every `customFields[i].streamId` MUST start with `${templateId}-`. This is the
**single load-bearing structural rule** of the design.

Enforced by:
- `loader.ts` (`loadTemplate`) — at template-load time, with cross-field
  validation (sections, key consistency, no mode-2/mode-3 collision).
- `CollectorRequest.addCustomField` — on every direct API call, in case
  callers skip the loader.
- `CollectorClient.accept()` — defence-in-depth before each `streams.create`.

Without this rule, two templates could collide on stream ids, or a malicious
template could squat under another's namespace. With this rule, every
template's customFields live under a deterministic prefix derived from its id,
and bridges/exports can detect template-scoped streams generically.

### Mode 3 — access-ask UX

`existingStreamRefs[]` declares **what permissions** the template needs on
**already-existing streams**. The user app's accept flow surfaces a per-stream
consent prompt before granting; refusing one ref blocks the entire acceptance
(consistent with chat-feature acceptance).

Each ref:
```jsonc
{
  "streamId":    "some-account-level-stream",
  "permissions": ["manage"],
  "purpose":     "human-readable-purpose"
}
```

The `purpose` field is informational — surfaces in the UI as the consent prompt's
explanation. Permissions are Pryv's standard `read | manage | contribute` levels.

The CollectorClient append-permissions block applies the requested permissions
without `streams.create` calls (the streams already exist).

### How the loader enforces the rules

`loader.ts` runs:

1. Ajv schema validation against `schemas/appTemplate.schema.json`.
2. **Cross-field rules** (Ajv can't express these):
   - Sandbox prefix on `customFields[].streamId`.
   - `customFields[].def.templateId === template.id`.
   - `customFields[].streamId` ends with `-${def.key}`.
   - `customFields[].def.section?` references existing `section.key`.
   - `existingStreamRefs[].streamId` does NOT match `${templateId}-*` (mode-2/mode-3 collision).
   - No collision between `customFields[].streamId` and `existingStreamRefs[].streamId`.
   - `section.customFieldKeys[]` references existing `customFields[].def.key`.

Errors are surfaced as `HDSLibError` with the full list of violations.

---

## 9. Bridge / export discoverability

A generic stream traverser (think `lib-bridge-js` or a data-export tool)
detects template-private streams by **introspecting `clientData`**, never by
regex on stream id.

```ts
function listTemplatePrivateStreams (streamTree: Pryv.Stream[]) {
  const out: { streamId: string, templateId: string, eventType: string, def: HDSCustomFieldDef }[] = [];
  for (const stream of allStreamsAndChildren(streamTree)) {
    const cf = (stream as any).clientData?.hdsCustomField;
    if (!cf) continue;
    for (const [eventType, def] of Object.entries(cf)) {
      if (Object.keys(def as any).length === 0) continue; // opt-out marker
      out.push({ streamId: stream.id, templateId: (def as any).templateId, eventType, def: def as any });
    }
  }
  return out;
}
```

Bridges that wire custom-field events into external systems (e.g. exporting
custom-field events to an external study database) work without knowing a
template's id ahead of time.

---

## 10. No-promotion principle

A custom field never **renames in place** to canonical. If a template's field
turns out to be broadly useful, the path is:

1. Add a canonical itemDef in `data-model` (new streamId, new itemKey).
2. Migrate writers to the canonical streamId.
3. Continue reading the template-private streamId in parallel (existing data
   stays addressable).
4. Eventually retire the template-private declaration by writing `{}` to the
   field's `clientData.hdsCustomField[eventType]` (opt-out marker), or by
   removing the stream entirely once all data has been migrated.

The opt-out marker `{}` exists precisely for this case — the stream stays
visible (existing events keep validating), but new events are not collected
through the form engine.

---

## 11. Failure modes & operational gotchas

- **Missing `clientData` on a stream that should declare a custom field.** The
  resolver walks up to the parent. If no ancestor declares the field, the
  resolver returns `null` and the form engine omits it. To debug: print
  `streamTree.find(streamId)` and check each parent's `clientData`.
- **Mismatched eventType.** A custom-field declaration is keyed by eventType.
  Writing an event of a different type to that stream falls through the
  template-level decl and is validated against the canonical lookup (which
  may reject if no canonical def exists).
- **Deleted templates.** If a template is removed from a doctor's account, its
  `customFields[]`-provisioned streams stay on the patient's account (they
  carry historic events). The patient app's stream traverser still surfaces
  them via `clientData.hdsCustomField` introspection — no orphan handling
  needed beyond marking them as "from a deleted template" in the UI.
- **Stream-tree access cost.** The resolver walks parents up to the root.
  Use `buildStreamMap()` once and pass the map to repeated calls when
  resolving many fields against the same tree.
- **Sandbox-prefix violation slips past the loader** (e.g. callers
  constructing `CollectorRequest` directly with hand-rolled JSON). The
  `addCustomField` setter and `CollectorClient.accept()` re-check; the rule
  is enforced in three places by design.

---

## 12. Cross-references

- **`data-model` `documentation/CUSTOM-FIELDS-AND-SYSTEM.md`** — validator side
  (storage-shape eventTypes, parent-chain walk in `data-model`'s `src/items.js`).
- **`AGENTS.md`** (repo root) — agent primer; this file is its detailed
  reference for everything `appTemplates`-shaped.
