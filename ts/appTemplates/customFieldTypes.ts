/**
 * Custom-field type definitions (Plan 45 §1).
 *
 * Templates declare per-eventType field-defs in `clientData.hdsCustomField[<eventType>]`
 * on each provisioned stream. The validator walks the parent chain (§2.4) — an empty
 * `{}` def on a descendant stream is the explicit opt-out marker.
 */

import { type localizableText } from '../localizeText.ts';

/** Storage-shape eventTypes valid as a custom-field key (keys of HDSCustomField). */
export type CustomFieldEventType =
  | 'note/txt'
  | 'note/html'
  | 'count/generic'
  | 'date/iso-8601'
  | 'activity/plain';

/** Empty object — the explicit opt-out marker on a descendant stream (§2.4). */
export type EmptyDef = Record<string, never>;

/** Per-eventType field declaration carried in `clientData.hdsCustomField[<eventType>]`. */
export interface HDSCustomFieldDef {
  /** Schema version of this field's declaration. Bump on incompatible payload changes. */
  version: 'v1';

  /** Template that authored this field (informational; the namespace prefix is the load-bearing one). */
  templateId: string;

  /** Field key inside the template (matches the streamId suffix after `{templateId}-custom-`). */
  key: string;

  /** UI label. */
  label: localizableText;
  description?: localizableText;

  /** Section identifier the form-engine renders under. */
  section?: string;

  /** Form-engine constraints (Plan 45 Q6). Storage shape is enforced by the eventType, not by these. */
  required?: boolean;
  maxLength?: number;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  minDate?: string;
  maxDate?: string;
  /** Pryv repeatable expression, e.g. 'P1D' / 'unlimited' / 'once' / 'any'. */
  repeatable?: string;
}

/**
 * Full `clientData.hdsCustomField` shape — keyed by eventType.
 * An empty def (`{}`) on a descendant stream is the explicit opt-out (§2.4).
 */
export type HDSCustomField = Partial<Record<CustomFieldEventType, HDSCustomFieldDef | EmptyDef>>;

/** True when a value is the empty-object opt-out marker. */
export function isEmptyDef (v: unknown): v is EmptyDef {
  return v != null && typeof v === 'object' && Object.keys(v as object).length === 0;
}
