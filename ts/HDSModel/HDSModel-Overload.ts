import { HDSLibError } from '../errors.ts';

/**
 * HDSModelOverload — payload an app can pass to `HDSModel.load()` /
 * `initHDSModel()` to extend or refine the shared HDS data model at runtime.
 *
 * The shape mirrors the post-build pack structure (the same one HDSModel
 * consumes) so it can be deep-merged into `#modelData` before freeze.
 *
 * What overloads can do:
 *  - add brand new itemDefs / streams / eventTypes / settings / datasources / appStreams
 *  - complete or replace localized labels & descriptions
 *  - customize the default `repeatable` value of an existing item
 *  - extend `eventTypes.extras[k]` (display hints, symbols)
 *
 * What overloads CANNOT do (will throw HDSLibError):
 *  - change the `parentId` of an existing stream (tree structure is frozen)
 *  - change `type` or json-schema of an existing eventType
 *  - change `type`, `streamId`, `eventType` (or variations / options /
 *    composite / datasource / converter-engine) of an existing itemDef
 *  - change `type` or `eventType` of an existing setting
 *  - change `endpoint` / `queryParam` / `resultKey` of an existing datasource
 */
export interface HDSModelOverload {
  items?: { [key: string]: any };
  streams?: any[];
  eventTypes?: {
    types?: { [key: string]: any };
    extras?: { [key: string]: any };
  };
  settings?: { [key: string]: any };
  datasources?: { [key: string]: any };
  appStreams?: { [key: string]: any };
}

/** Fields on an existing itemDef that an overload is allowed to change. */
const ITEM_MUTABLE_FIELDS = new Set(['label', 'description', 'repeatable', 'reminder', 'devNotes']);

/** Fields on an existing itemDef that an overload must NOT change. */
const ITEM_IMMUTABLE_FIELDS = new Set([
  'type', 'streamId', 'eventType', 'variations', 'options', 'composite', 'datasource', 'converter-engine'
]);

/** Fields on an existing setting that an overload must NOT change. */
const SETTING_IMMUTABLE_FIELDS = new Set(['type', 'eventType']);

/** Fields on an existing datasource that an overload must NOT change. */
const DATASOURCE_IMMUTABLE_FIELDS = new Set(['endpoint', 'queryParam', 'resultKey']);

/**
 * Validate an overload against the current modelData.
 * Throws HDSLibError listing every forbidden change attempted.
 *
 * Note: this only enforces the policy table. It does NOT re-run the data-model
 * AJV schema. Apps that want full schema validation should run AJV against
 * their overload at build time (see `data-model/data-model/src/schemas/`).
 */
export function validateOverload (modelData: any, overload: HDSModelOverload): void {
  const errors: string[] = [];

  // ---- items ----
  if (overload.items) {
    for (const [key, overlay] of Object.entries(overload.items)) {
      const base = modelData.items?.[key];
      if (!base) continue; // adding a new item is always allowed
      for (const field of Object.keys(overlay)) {
        if (ITEM_IMMUTABLE_FIELDS.has(field)) {
          errors.push(`item "${key}": cannot override immutable field "${field}"`);
        } else if (!ITEM_MUTABLE_FIELDS.has(field) && field !== 'version' && field !== 'key') {
          errors.push(`item "${key}": unknown overlay field "${field}"`);
        }
      }
    }
  }

  // ---- streams ---- (walk overlay tree, compare to flat base index)
  if (overload.streams) {
    const baseById: { [id: string]: any } = {};
    indexStreams(modelData.streams || [], baseById);
    walkOverloadStreams(overload.streams, null, baseById, errors);
  }

  // ---- eventTypes ----
  if (overload.eventTypes?.types) {
    for (const key of Object.keys(overload.eventTypes.types)) {
      if (modelData.eventTypes?.types?.[key]) {
        errors.push(`eventTypes.types["${key}"]: cannot override existing eventType schema`);
      }
    }
  }
  // extras: any change allowed (additive or override of display hints)

  // ---- settings ----
  if (overload.settings) {
    for (const [key, overlay] of Object.entries(overload.settings)) {
      const base = modelData.settings?.[key];
      if (!base) continue;
      for (const field of Object.keys(overlay)) {
        if (SETTING_IMMUTABLE_FIELDS.has(field)) {
          errors.push(`settings["${key}"]: cannot override immutable field "${field}"`);
        }
      }
    }
  }

  // ---- datasources ----
  if (overload.datasources) {
    for (const [key, overlay] of Object.entries(overload.datasources)) {
      const base = modelData.datasources?.[key];
      if (!base) continue;
      for (const field of Object.keys(overlay)) {
        if (DATASOURCE_IMMUTABLE_FIELDS.has(field)) {
          errors.push(`datasources["${key}"]: cannot override immutable field "${field}"`);
        }
      }
    }
  }

  // appStreams: no immutable fields enforced beyond what consumers expect.
  // (left as additive/refining only — full schema validation is the app's job)

  if (errors.length > 0) {
    throw new HDSLibError(
      `HDSModelOverload validation failed (${errors.length} error${errors.length > 1 ? 's' : ''}):\n  - ` + errors.join('\n  - '),
      { errors }
    );
  }
}

/**
 * Merge an overload into mutable modelData IN PLACE.
 * Caller is responsible for calling `validateOverload` first AND for making
 * sure `modelData` is still mutable (not yet `deepFreeze`d).
 *
 * Merge semantics:
 *  - items: per-key shallow merge with deep-merge of `label` / `description` /
 *    `reminder`. Overload wins for any specific language string.
 *  - streams: tree merge. New nodes are inserted under their parent (which
 *    must already exist in base or earlier in the overlay). Existing nodes
 *    get their `name` overlaid and their `children` recursively merged.
 *  - eventTypes.types: additive only (validator already rejected overrides).
 *  - eventTypes.extras: per-key shallow merge (overload wins).
 *  - settings / datasources / appStreams: per-key shallow merge with deep
 *    merge of localized fields.
 */
export function applyOverload (modelData: any, overload: HDSModelOverload): void {
  // ---- items ----
  if (overload.items) {
    if (!modelData.items) modelData.items = {};
    for (const [key, overlay] of Object.entries(overload.items)) {
      const base = modelData.items[key];
      if (!base) {
        modelData.items[key] = { ...(overlay as any) };
      } else {
        mergeShallowWithLocalized(base, overlay as any, ['label', 'description', 'reminder']);
      }
    }
  }

  // ---- streams ----
  if (overload.streams) {
    if (!modelData.streams) modelData.streams = [];
    const baseById: { [id: string]: any } = {};
    indexStreams(modelData.streams, baseById);
    mergeStreamForest(overload.streams, modelData.streams, baseById, null);
  }

  // ---- eventTypes ----
  if (overload.eventTypes) {
    if (!modelData.eventTypes) modelData.eventTypes = { types: {}, extras: {} };
    if (overload.eventTypes.types) {
      modelData.eventTypes.types = modelData.eventTypes.types || {};
      for (const [k, v] of Object.entries(overload.eventTypes.types)) {
        if (!modelData.eventTypes.types[k]) modelData.eventTypes.types[k] = v;
      }
    }
    if (overload.eventTypes.extras) {
      modelData.eventTypes.extras = modelData.eventTypes.extras || {};
      for (const [k, v] of Object.entries(overload.eventTypes.extras)) {
        modelData.eventTypes.extras[k] = { ...(modelData.eventTypes.extras[k] || {}), ...(v as any) };
      }
    }
  }

  // ---- settings ----
  if (overload.settings) {
    if (!modelData.settings) modelData.settings = {};
    for (const [key, overlay] of Object.entries(overload.settings)) {
      const base = modelData.settings[key];
      if (!base) {
        modelData.settings[key] = { ...(overlay as any) };
      } else {
        mergeShallowWithLocalized(base, overlay as any, ['label', 'description']);
      }
    }
  }

  // ---- datasources ----
  if (overload.datasources) {
    if (!modelData.datasources) modelData.datasources = {};
    for (const [key, overlay] of Object.entries(overload.datasources)) {
      const base = modelData.datasources[key];
      if (!base) {
        modelData.datasources[key] = { ...(overlay as any) };
      } else {
        mergeShallowWithLocalized(base, overlay as any, ['label', 'description']);
      }
    }
  }

  // ---- appStreams ----
  if (overload.appStreams) {
    if (!modelData.appStreams) modelData.appStreams = {};
    for (const [key, overlay] of Object.entries(overload.appStreams)) {
      const base = modelData.appStreams[key];
      if (!base) {
        modelData.appStreams[key] = { ...(overlay as any) };
      } else {
        mergeShallowWithLocalized(base, overlay as any, ['label', 'description']);
      }
    }
  }
}

/**
 * Shallow-merge `overlay` into `base` IN PLACE, but for the listed
 * `localizedFields` do a one-level deep merge (so per-language strings can be
 * added without dropping siblings).
 */
function mergeShallowWithLocalized (base: any, overlay: any, localizedFields: string[]): void {
  for (const [field, value] of Object.entries(overlay)) {
    if (localizedFields.includes(field) && value && typeof value === 'object' && !Array.isArray(value) &&
        base[field] && typeof base[field] === 'object' && !Array.isArray(base[field])) {
      base[field] = { ...base[field], ...(value as any) };
    } else {
      base[field] = value;
    }
  }
}

/**
 * Merge a forest of overlay stream nodes into a base forest.
 * - existing nodes: overlay `name`, recurse into children
 * - new nodes: must declare `parentId` that exists somewhere (base or earlier
 *   in the overlay). Inserted as children of that parent. New roots
 *   (parentId === null) are appended to the base root list.
 */
function mergeStreamForest (
  overlayNodes: any[],
  baseRoots: any[],
  baseById: { [id: string]: any },
  parentIdFromTreePosition: string | null
): void {
  for (const overlayNode of overlayNodes) {
    const existing = baseById[overlayNode.id];
    if (existing) {
      if (overlayNode.name !== undefined) existing.name = overlayNode.name;
      if (overlayNode.children) {
        if (!existing.children) existing.children = [];
        mergeStreamForest(overlayNode.children, baseRoots, baseById, existing.id);
      }
      continue;
    }
    // New node — figure out where it goes
    const parentId = overlayNode.parentId !== undefined ? overlayNode.parentId : parentIdFromTreePosition;
    const newNode: any = {
      id: overlayNode.id,
      name: overlayNode.name,
      parentId: parentId ?? null
    };
    if (parentId == null) {
      baseRoots.push(newNode);
    } else {
      const parent = baseById[parentId];
      if (!parent) {
        throw new HDSLibError(
          `HDSModelOverload: stream "${overlayNode.id}" references parentId "${parentId}" which does not exist`,
          { streamId: overlayNode.id, parentId }
        );
      }
      if (!parent.children) parent.children = [];
      parent.children.push(newNode);
    }
    baseById[newNode.id] = newNode;
    if (overlayNode.children) {
      newNode.children = [];
      mergeStreamForest(overlayNode.children, baseRoots, baseById, newNode.id);
    }
  }
}

/** Build a flat id→node index of an existing (base) stream tree. */
function indexStreams (streams: any[], out: { [id: string]: any }): void {
  for (const s of streams) {
    out[s.id] = s;
    if (s.children) indexStreams(s.children, out);
  }
}

/**
 * Walk an overload stream tree and record any forbidden mutations.
 * `expectedParentId` is the parentId implied by the overload's tree position
 * (null at the root level — see `applyOverload` for how new roots are placed).
 */
function walkOverloadStreams (
  nodes: any[],
  expectedParentId: string | null,
  baseById: { [id: string]: any },
  errors: string[]
): void {
  for (const node of nodes) {
    if (!node.id) {
      errors.push('streams: every node must have an id');
      continue;
    }
    const base = baseById[node.id];
    if (base) {
      // Existing stream: parentId must not change.
      if (node.parentId !== undefined && node.parentId !== base.parentId) {
        errors.push(`streams["${node.id}"]: cannot change parentId ("${base.parentId}" → "${node.parentId}")`);
      }
      // expectedParentId mismatch (overlay places this node under a different parent than the base)
      if (expectedParentId !== null && expectedParentId !== base.parentId) {
        errors.push(`streams["${node.id}"]: cannot reparent (base parentId="${base.parentId}", overlay places under "${expectedParentId}")`);
      }
    }
    if (node.children) walkOverloadStreams(node.children, node.id, baseById, errors);
  }
}
