/**
 * Stream-tree resolver helpers (Plan 45 §6).
 *
 * Walk the parent chain of a runtime Pryv stream tree looking for
 * `clientData.hdsCustomField[eventType]` or `clientData.hdsSystemFeature[messageType]`.
 *
 * Inheritance semantics (Plan 45 §2.4):
 *   - present non-empty def → use it
 *   - present empty `{}` def → opt-out (return null)
 *   - missing → keep walking up
 *   - reached root with nothing → null
 *
 * Callers wanting to distinguish "no declaration" from "explicit opt-out" can use
 * `resolveStreamCustomFieldDetailed` which returns `{ kind, def? }`.
 */

import type { pryv as Pryv } from '../patchedPryv.ts';
import {
  type CustomFieldEventType,
  type HDSCustomFieldDef,
  type EmptyDef,
  isEmptyDef
} from './customFieldTypes.ts';
import {
  type SystemMessageType,
  type HDSSystemAlertDef,
  type HDSSystemAckDef
} from './systemFeatureTypes.ts';
import type { CustomFieldDeclaration } from './templateTypes.ts';

type StreamMap = Map<string, Pryv.Stream>;

/** Build a flat id→stream map from a Pryv stream tree. */
export function buildStreamMap (streamTree: Pryv.Stream[]): StreamMap {
  const map: StreamMap = new Map();
  function walk (nodes: Pryv.Stream[]): void {
    for (const s of nodes) {
      map.set(s.id, s);
      if ((s as any).children?.length) walk((s as any).children as Pryv.Stream[]);
    }
  }
  walk(streamTree);
  return map;
}

export type ResolutionKind = 'def' | 'optOut' | 'none';
export interface CustomFieldResolution {
  kind: ResolutionKind;
  def?: HDSCustomFieldDef;
}

/**
 * Walk parent chain looking for `clientData.hdsCustomField[eventType]`.
 * Returns the resolved def, an opt-out marker, or `none`.
 *
 * `streamTreeOrMap` may be either a Pryv stream tree (`Pryv.Stream[]`) or a
 * pre-built id→stream map (cheaper when resolving many fields against the same tree).
 */
export function resolveStreamCustomFieldDetailed (
  streamTreeOrMap: Pryv.Stream[] | StreamMap,
  streamId: string,
  eventType: CustomFieldEventType
): CustomFieldResolution {
  const map = isStreamMap(streamTreeOrMap) ? streamTreeOrMap : buildStreamMap(streamTreeOrMap);
  const visited = new Set<string>();
  let cur: Pryv.Stream | undefined = map.get(streamId);
  while (cur) {
    if (visited.has(cur.id)) return { kind: 'none' }; // defensive
    visited.add(cur.id);

    const cd = (cur as any).clientData;
    const decl = cd?.hdsCustomField?.[eventType];
    if (decl !== undefined) {
      if (isEmptyDef(decl)) return { kind: 'optOut' };
      return { kind: 'def', def: decl as HDSCustomFieldDef };
    }
    const parentId = (cur as any).parentId as string | null | undefined;
    cur = parentId ? map.get(parentId) : undefined;
  }
  return { kind: 'none' };
}

/** Convenience: returns the def or null (collapses opt-out and none). */
export function resolveStreamCustomField (
  streamTreeOrMap: Pryv.Stream[] | StreamMap,
  streamId: string,
  eventType: CustomFieldEventType
): HDSCustomFieldDef | null {
  const r = resolveStreamCustomFieldDetailed(streamTreeOrMap, streamId, eventType);
  return r.kind === 'def' ? r.def! : null;
}

export interface SystemFeatureResolution {
  kind: ResolutionKind;
  def?: HDSSystemAlertDef | HDSSystemAckDef;
}

/**
 * Walk parent chain looking for `clientData.hdsSystemFeature[messageType]`.
 * Same semantics as `resolveStreamCustomFieldDetailed` (`def` / `optOut` / `none`).
 */
export function resolveStreamSystemFeatureDetailed (
  streamTreeOrMap: Pryv.Stream[] | StreamMap,
  streamId: string,
  messageType: SystemMessageType
): SystemFeatureResolution {
  const map = isStreamMap(streamTreeOrMap) ? streamTreeOrMap : buildStreamMap(streamTreeOrMap);
  const visited = new Set<string>();
  let cur: Pryv.Stream | undefined = map.get(streamId);
  while (cur) {
    if (visited.has(cur.id)) return { kind: 'none' };
    visited.add(cur.id);

    const cd = (cur as any).clientData;
    const decl = cd?.hdsSystemFeature?.[messageType];
    if (decl !== undefined) {
      if (isEmptyDef(decl)) return { kind: 'optOut' };
      return { kind: 'def', def: decl as HDSSystemAlertDef | HDSSystemAckDef };
    }
    const parentId = (cur as any).parentId as string | null | undefined;
    cur = parentId ? map.get(parentId) : undefined;
  }
  return { kind: 'none' };
}

export function resolveStreamSystemFeature (
  streamTreeOrMap: Pryv.Stream[] | StreamMap,
  streamId: string,
  messageType: SystemMessageType
): HDSSystemAlertDef | HDSSystemAckDef | null {
  const r = resolveStreamSystemFeatureDetailed(streamTreeOrMap, streamId, messageType);
  return r.kind === 'def' ? r.def! : null;
}

/**
 * Convert a resolved custom-field def to a virtual HDSItemDef-shaped object the
 * form engine can render alongside canonical items. Returns null for opt-out / none.
 *
 * The shape mirrors what `HDSItemDef` exposes — sufficient for hds-forms-js's
 * field renderers (label, description, eventType, repeatable, options, min/max/etc).
 */
/**
 * Form-engine field types. Aligned with hds-forms-js's HDSFormField type switch
 * so consumers can pass `virtual.data` to a HDSFormField directly.
 */
export type VirtualItemFieldType = 'text' | 'select' | 'number' | 'date';

export interface VirtualItemDef {
  /** Synthetic itemKey unique within a template: `{templateId}::{key}` */
  key: string;
  data: {
    type: VirtualItemFieldType;
    eventType: CustomFieldEventType;
    streamId: string;
    label: HDSCustomFieldDef['label'];
    description?: HDSCustomFieldDef['description'];
    repeatable?: string;
    required?: boolean;
    maxLength?: number;
    /** Select options — present when eventType is 'note/txt' with def.options[]. */
    options?: Array<{ value: string, label: { en: string } }>;
    min?: number;
    max?: number;
    step?: number;
    minDate?: string;
    maxDate?: string;
    section?: string;
  };
  /** Original def for round-tripping. */
  customField: HDSCustomFieldDef;
  /** Pryv event template for the form-engine submit path. Mirrors HDSItemDef.eventTemplate. */
  eventTemplate (): { streamIds: string[], type: CustomFieldEventType };
}

const EVENT_TYPE_TO_FORM_TYPE: Record<CustomFieldEventType, VirtualItemFieldType> = {
  'note/txt': 'text',
  'note/html': 'text',
  'count/generic': 'number',
  'date/iso-8601': 'date',
  'activity/plain': 'text'
};

/**
 * Convenience for the form engine: resolve and convert in one call.
 * Returns null if the field is missing or opted-out.
 *
 * The returned `data` mirrors HDSItemDef.data so it can be passed straight
 * into hds-forms-js's `<HDSFormField itemData={...}>`.
 */
export function streamCustomFieldToVirtualItem (
  streamTreeOrMap: Pryv.Stream[] | StreamMap,
  streamId: string,
  eventType: CustomFieldEventType
): VirtualItemDef | null {
  const def = resolveStreamCustomField(streamTreeOrMap, streamId, eventType);
  if (!def) return null;
  // note/txt with options → render as <select>
  let formType = EVENT_TYPE_TO_FORM_TYPE[eventType];
  let options: VirtualItemDef['data']['options'];
  if (eventType === 'note/txt' && def.options && def.options.length > 0) {
    formType = 'select';
    options = def.options.map((v) => ({ value: v, label: { en: v } }));
  }
  return {
    key: `${def.templateId}::${def.key}`,
    data: {
      type: formType,
      eventType,
      streamId,
      label: def.label,
      description: def.description,
      repeatable: def.repeatable,
      required: def.required,
      maxLength: def.maxLength,
      options,
      min: def.min,
      max: def.max,
      step: def.step,
      minDate: def.minDate,
      maxDate: def.maxDate,
      section: def.section
    },
    customField: def,
    eventTemplate () { return { streamIds: [streamId], type: eventType }; }
  };
}

function isStreamMap (v: Pryv.Stream[] | StreamMap): v is StreamMap {
  return typeof (v as Map<string, unknown>).get === 'function';
}

/**
 * Convert a `CustomFieldDeclaration` (as carried on a template / CollectorRequest)
 * to a `VirtualItemDef` for form-engine consumption. Use at compose time when
 * the declaration is in hand — no stream-tree lookup needed.
 *
 * Equivalent to `streamCustomFieldToVirtualItem` minus the parent-chain walk.
 */
export function customFieldDeclarationToVirtualItem (decl: CustomFieldDeclaration): VirtualItemDef {
  const def = decl.def;
  let formType = EVENT_TYPE_TO_FORM_TYPE[decl.eventType];
  let options: VirtualItemDef['data']['options'];
  if (decl.eventType === 'note/txt' && def.options && def.options.length > 0) {
    formType = 'select';
    options = def.options.map((v) => ({ value: v, label: { en: v } }));
  }
  return {
    key: `${def.templateId}::${def.key}`,
    data: {
      type: formType,
      eventType: decl.eventType,
      streamId: decl.streamId,
      label: def.label,
      description: def.description,
      repeatable: def.repeatable,
      required: def.required,
      maxLength: def.maxLength,
      options,
      min: def.min,
      max: def.max,
      step: def.step,
      minDate: def.minDate,
      maxDate: def.maxDate,
      section: def.section
    },
    customField: def,
    eventTemplate () { return { streamIds: [decl.streamId], type: decl.eventType }; }
  };
}

export type { EmptyDef };
