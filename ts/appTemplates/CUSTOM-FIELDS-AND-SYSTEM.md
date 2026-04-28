# Custom fields & system stream — design reference

This is the canonical developer/agent reference for two `appTemplates` extensions
that share the same infrastructure:

1. **Custom fields** — template-private fields stored on namespaced streams
2. **System stream** — operator → user alerts and user → operator acks on the
   account-level `app-system/*` stream pair

Both are **declared in `clientData`** rather than baked into the canonical data
model, so templates extend the model without polluting it.

> Companion reading:
> - `data-model/documentation/CUSTOM-FIELDS-AND-SYSTEM.md` — validator side
> - `_plans/45-custom-fields-appTemplates-atwork/PLAN.md` — design rationale & open-question log
> - `_plans/45-custom-fields-appTemplates-atwork/spec.md` — implementation-ready blueprint

---

## 1. Conceptual overview

### Why custom fields exist

A template may need to capture data points that are not (and should not be)
canonical items. The canonical `data-model/pack.json` is the shared lingua franca
of HDS — adding `stormm-cohort-id` or `study-coordinator-note` would brand it
with one consumer's vocabulary forever.

Custom fields let a template **provision its own template-private streams** at
acceptance time, declared with everything the form engine and validator need to
treat them as first-class fields *without* a canonical itemDef.

### Why the system stream exists

Operators (e.g. study coordinators, doctors) need a back-channel to push
notifications to participants ("please complete today's questionnaire") and to
receive structured acknowledgements. Chat is correspondent-scoped (per
collector ↔ user pair); system messages are account-scoped (one inbox per user)
because users want a single "alerts" pane.

Plan 25 already shipped the `{app-id}-app/` convention (e.g. `bridge-mira-app-notes`).
The system stream extends that to **per-account** fixtures `app-system-out` /
`app-system-in` carrying `clientData.hdsSystemFeature` declarations.

### The "no canonical model branding" principle

Neither feature mutates `data-model`'s `pack.json`. The data-model only ships:

- Storage-shape `eventTypes` (`note/txt`, `count/generic`, `message/system-alert`, …)
- Semantic itemDefs that map onto those eventTypes

Templates carry their own typing inline on the streams they provision. The
runtime resolver (`hds-lib-js`) walks the parent chain reading `clientData` —
no naming convention check, no regex on stream ids, no central registry.

### Relationship to Plan 25's `{app-id}-app/` convention

Plan 25 generalised the bridge-side stream layout (`bridge-mira-app-notes`,
`bridge-mira-app-chat`, …). Plan 45 reuses the same idea for **templates**
(`stormm-woman-custom-flow`) and adds **account-level** fixtures
(`app-system-out`, `app-system-in`) for system messaging.

| Layer       | Convention                          | Example                          |
| ----------- | ----------------------------------- | -------------------------------- |
| Bridge      | `{bridge-id}-app-{suffix}`          | `bridge-mira-app-notes`          |
| Template    | `{template-id}-custom-{key}`        | `stormm-woman-custom-flow`       |
| Account     | `app-{feature}-{out\|in}`           | `app-system-out`, `app-system-in`|

Naming is **soft / non-load-bearing** — the hyphenated prefixes are conventions
for human readability. The validator and resolver consume `clientData`, never
the streamId.

---

## 2. `clientData.hdsCustomField` schema

Each custom-field-bearing stream carries a single declaration keyed by eventType:

```jsonc
// stream { id: 'stormm-woman-custom-flow', parentId: 'stormm-woman-custom', clientData: ↓ }
{
  "hdsCustomField": {
    "note/txt": {
      "version":     "v1",
      "templateId":  "stormm-woman",
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

### Worked example — STORMM-style snippet

```jsonc
// stormm-woman template
{
  "id": "stormm-woman",
  "customFields": [
    {
      "streamId":  "stormm-woman-custom-flow",
      "eventType": "note/txt",
      "def": {
        "version": "v1", "templateId": "stormm-woman", "key": "flow",
        "label": { "en": "Menstrual flow" },
        "options": ["light", "medium", "heavy"]
      }
    },
    {
      "streamId":  "stormm-woman-custom-pain",
      "eventType": "count/generic",
      "def": {
        "version": "v1", "templateId": "stormm-woman", "key": "pain",
        "label": { "en": "Pain (0-10)" },
        "min": 0, "max": 10, "step": 1
      }
    }
  ]
}
```

At acceptance the patient's account is provisioned with:
- `stormm-woman-custom` (parent, idempotent)
- `stormm-woman-custom-flow` with `clientData.hdsCustomField['note/txt']` = the def
- `stormm-woman-custom-pain` with `clientData.hdsCustomField['count/generic']` = the def

The requester's access gains `contribute` on each.

---

## 3. `clientData.hdsSystemFeature` schema

Same shape, different key — keyed by `message/*` impl rather than storage eventType:

```jsonc
// stream { id: 'app-system-out', parentId: 'app-system', clientData: ↓ }
{
  "hdsSystemFeature": {
    "message/system-alert": {
      "version": "v1",
      "levels":  ["info", "warning", "critical"]
    }
  }
}

// stream { id: 'app-system-in', parentId: 'app-system', clientData: ↓ }
{
  "hdsSystemFeature": {
    "message/system-ack": { "version": "v1" }
  }
}
```

A descendant stream can override (declare its own def) or opt-out (declare `{}`)
exactly like custom fields.

Future extension types (`message/system-reminder`, `message/access-update-request`)
can be added without breaking existing readers — unknown keys are skipped by the
resolver.

---

## 4. Inheritance semantics (parent-chain walk)

A field-def is resolved by walking from a stream up its parent chain. For each
stream visited, the resolver inspects `clientData.hdsCustomField[eventType]`
(or `hdsSystemFeature[messageType]`) and applies one of three rules:

| Value on stream         | Outcome                                |
| ----------------------- | -------------------------------------- |
| Non-empty def           | **Use it**, stop walking.              |
| `{}` (empty object)     | **Opt-out**, stop walking.             |
| Missing                 | Keep walking up the chain.             |
| Reached root, no def    | `none` — fall through to canonical lookup. |

### Worked examples

```text
stormm-woman                        clientData.hdsCustomField['note/txt'] = { …flow def, options: 3 levels }
└── stormm-woman-custom             (no clientData)
    ├── stormm-woman-custom-flow    clientData.hdsCustomField['note/txt'] = { …override, options: 4 levels }
    ├── stormm-woman-custom-quiet   clientData.hdsCustomField['note/txt'] = {}
    └── stormm-woman-custom-other   (no clientData)
```

| Resolved from                       | Result                          |
| ----------------------------------- | ------------------------------- |
| `stormm-woman-custom-flow`          | override def (4 levels)         |
| `stormm-woman-custom-quiet`         | opt-out (resolver returns null) |
| `stormm-woman-custom-other`         | inherits root def (3 levels)    |
| `stormm-woman-custom`               | inherits root def (3 levels)    |

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

The `*-custom-*` infix on template-private streams and the `app-system-*` /
`app-system-in` names on account fixtures are **human-readability conventions**.
The validator and resolver:

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
  resolveStreamSystemFeature,
  resolveStreamSystemFeatureDetailed,
  streamCustomFieldToVirtualItem,
  buildStreamMap
} from 'hds-lib';
```

### `resolveStreamCustomField(streamTreeOrMap, streamId, eventType): HDSCustomFieldDef | null`

Walks the parent chain. Returns the resolved def or `null` (no decl, or
explicit opt-out).

### `resolveStreamCustomFieldDetailed(...): { kind: 'def' | 'optOut' | 'none', def?: ... }`

Use when you need to distinguish opt-out from missing.

### `resolveStreamSystemFeature(...) / resolveStreamSystemFeatureDetailed(...)`

Same semantics for `clientData.hdsSystemFeature[messageType]`.

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
| 3    | `existingStreamRefs[]`                | Access asks on pre-existing streams (e.g. `app-system-*`). |

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
  "streamId":    "app-system-out",
  "permissions": ["manage"],
  "purpose":     "system-out"
}
```

The `purpose` field is informational — surfaces in the UI (e.g. "system messaging
to you"). Permissions are Pryv's standard `read | manage | contribute` levels.

The CollectorClient append-permissions block applies the requested permissions
without `streams.create` calls (the streams already exist).

### How a template declares system support

Templates declare system support **via Mode 3** referencing the canonical
account-level `app-system-out` / `app-system-in` streams. There is no
`features.system` block on the request — the system feature is a Mode-3 ask
like any other cross-app access:

```jsonc
"existingStreamRefs": [
  { "streamId": "app-system-out", "permissions": ["manage"], "purpose": "system-out" },
  { "streamId": "app-system-in",  "permissions": ["read"],   "purpose": "system-in" }
]
```

This keeps the request shape uniform (`features` is for in-place chat extensions
to a permission, not for cross-app references).

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

Same approach for `hdsSystemFeature[messageType]`. Result: bridges that wire
custom-field events into external systems (e.g. STORMM data export to REDCap)
work without knowing a template's id ahead of time.

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

- **Plan 45 PLAN.md** — design rationale + open-question log:
  `_plans/45-custom-fields-appTemplates-atwork/PLAN.md`
- **Plan 45 spec.md** — implementation-ready blueprint for Phases 2–9:
  `_plans/45-custom-fields-appTemplates-atwork/spec.md`
- **Plan 25 closure** — `{app-id}-app/` convention origin:
  `_plans/25-generic-app-stream-done/Plan.md`
- **Plan 47 (STORMM, paused)** — first consumer of customFields[] (Q10/Q16):
  `_plans/47-STORMM-forms-paused/PLAN.md`
- **`data-model/documentation/CUSTOM-FIELDS-AND-SYSTEM.md`** — validator side
  (storage-shape eventTypes, parent-chain walk in `data-model/src/items.js`).
- **`data-model/documentation/DESIGN-NOTES.md`** — eventType
  `<class>/<implementation>` convention used by the new `message/system-*` types.
- **`hds-lib-js/AGENTS.md`** — agent primer; this file is its detailed
  reference for everything `appTemplates`-shaped.
