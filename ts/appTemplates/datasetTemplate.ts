/**
 * Data-set templates (plan 108): an app publishes the scope of the data it collects as an
 * AppTemplate with publication fields (`hds-dataset.json`), and a data-collection tool
 * (doctor-dashboard) imports it, keeps it in sync and turns it into a FormSpec.
 *
 * - {@link templateScopeHash}: fingerprint of what the template asks access to, so a change is
 *   detected even when the publisher forgot to bump `version`.
 * - {@link diffTemplateScope}: what changed between two versions, and the semver bump it requires.
 * - {@link templateToFormSpec}: the FormSpec a data set starts from. Permissions are always
 *   derived from the data-model, never read from the template.
 */

import { getModel as getHDSModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { validateFormSpecItemKeys } from '../cmc/formSpec.ts';
import type { FormSpec, FormSpecItemKeyIssue, FormSpecSource } from '../cmc/formSpec.ts';
import type { Permission } from './interfaces.ts';
import { APP_PRIVATE_PURPOSE } from './templateTypes.ts';
import type { AppTemplate, AppTemplateSection, ExistingStreamRef } from './templateTypes.ts';

// ---------- scope hash ---------- //

/**
 * The part of a template that decides what a data set asks access to: each item with the
 * kind of section it sits in (permanent / recurring), the custom fields provisioned, and the
 * existing streams referenced with their permission levels. Section keys, names, order and
 * all texts are excluded — reorganising sections or rewording labels is not a scope change.
 */
export function templateScope (tpl: AppTemplate): {
  items: Array<[string, string]>;
  customFields: Array<[string, string]>;
  existingStreamRefs: Array<[string, string[]]>;
} {
  const items = new Map<string, string>();
  for (const s of tpl.sections) {
    for (const k of s.itemKeys ?? []) items.set(k, s.type);
  }
  return {
    items: [...items.entries()].sort(byFirst),
    customFields: (tpl.customFields ?? []).map(c => [c.streamId, c.eventType] as [string, string]).sort(byFirst),
    existingStreamRefs: (tpl.existingStreamRefs ?? [])
      .map(r => [r.streamId, [...r.permissions].sort()] as [string, string[]])
      .sort(byFirst)
  };
}

/** `sha256:<hex>` of {@link templateScope}. Stable under key order and section reorganisation. */
export async function templateScopeHash (tpl: AppTemplate): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(templateScope(tpl)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return 'sha256:' + hex;
}

// ---------- diff ---------- //

/** Semver part a publisher must bump for a given change. */
export type TemplateBump = 'major' | 'minor' | 'patch' | 'none';

export interface TemplateScopeDiff {
  /** Item keys present only in `next`. */
  added: string[];
  /** Item keys present only in `prev`. */
  removed: string[];
  /** Items whose section type changed (permanent ↔ recurring). */
  typeChanged: string[];
  /** Items that moved to another section of the same type (not a scope change). */
  moved: string[];
  /** Items whose cadence (`repeatable`, `reminder`, `required` customizations) changed. */
  cadenceChanged: string[];
  customFields: { added: string[]; removed: string[] };
  existingStreamRefs: { added: string[]; removed: string[]; permissionsChanged: string[] };
  /** Titles, descriptions, consent, section names, labels or app identity changed. */
  textsChanged: boolean;
  /** Something was removed or a grant changed: patients' existing consent no longer matches. */
  breaking: boolean;
  /** The bump this diff requires from the publisher. */
  requiredBump: TemplateBump;
  /** The bump the publisher actually made, read from `version` (`none` when equal or missing). */
  actualBump: TemplateBump;
  /** `actualBump` is lower than `requiredBump` (e.g. scope changed without a version bump). */
  underBumped: boolean;
}

/** Compare two versions of a template. Pure; no model needed. */
export function diffTemplateScope (prev: AppTemplate, next: AppTemplate): TemplateScopeDiff {
  const p = itemIndex(prev);
  const n = itemIndex(next);
  const added = [...n.keys()].filter(k => !p.has(k)).sort();
  const removed = [...p.keys()].filter(k => !n.has(k)).sort();
  const typeChanged: string[] = [];
  const moved: string[] = [];
  const cadenceChanged: string[] = [];
  for (const [k, a] of p) {
    const b = n.get(k);
    if (b == null) continue;
    if (a.type !== b.type) typeChanged.push(k);
    else if (a.sectionKey !== b.sectionKey) moved.push(k);
    if (stable(cadenceOf(a.cust)) !== stable(cadenceOf(b.cust))) cadenceChanged.push(k);
  }

  const pcf = new Set((prev.customFields ?? []).map(c => c.streamId + '|' + c.eventType));
  const ncf = new Set((next.customFields ?? []).map(c => c.streamId + '|' + c.eventType));
  const customFields = {
    added: [...ncf].filter(x => !pcf.has(x)).sort(),
    removed: [...pcf].filter(x => !ncf.has(x)).sort()
  };

  const pr = refIndex(prev.existingStreamRefs);
  const nr = refIndex(next.existingStreamRefs);
  const existingStreamRefs = {
    added: [...nr.keys()].filter(k => !pr.has(k)).sort(),
    removed: [...pr.keys()].filter(k => !nr.has(k)).sort(),
    permissionsChanged: [...pr.keys()].filter(k => nr.has(k) && pr.get(k) !== nr.get(k)).sort()
  };

  const textsChanged = stable(textsOf(prev)) !== stable(textsOf(next));

  const breaking = removed.length > 0 || typeChanged.length > 0 ||
    customFields.removed.length > 0 ||
    existingStreamRefs.removed.length > 0 || existingStreamRefs.permissionsChanged.length > 0;
  const additive = added.length > 0 || cadenceChanged.length > 0 ||
    customFields.added.length > 0 || existingStreamRefs.added.length > 0;
  const requiredBump: TemplateBump = breaking
    ? 'major'
    : additive ? 'minor' : (textsChanged || moved.length > 0) ? 'patch' : 'none';
  const actualBump = semverBump(prev.version, next.version);
  return {
    added,
    removed,
    typeChanged: typeChanged.sort(),
    moved: moved.sort(),
    cadenceChanged: cadenceChanged.sort(),
    customFields,
    existingStreamRefs,
    textsChanged,
    breaking,
    requiredBump,
    actualBump,
    underBumped: BUMP_RANK[actualBump] < BUMP_RANK[requiredBump]
  };
}

/**
 * What applying `tpl` would change in an existing data set: the FormSpec (including the
 * owner's own edits since import) is read as the previous template. `actualBump` compares
 * `formSpec.source.version` with `tpl.version`.
 */
export function diffFormSpecWithTemplate (formSpec: FormSpec, tpl: AppTemplate): TemplateScopeDiff {
  const prev: AppTemplate = {
    id: formSpec.source?.templateId ?? tpl.id,
    title: formSpec.title,
    description: formSpec.description,
    chat: !!formSpec.features?.chat,
    sections: formSpec.sections,
    customFields: formSpec.customFields,
    existingStreamRefs: formSpec.existingStreamRefs,
    consent: formSpec.consent,
    version: formSpec.source?.version,
    app: tpl.app
  };
  return diffTemplateScope(prev, tpl);
}

const BUMP_RANK: Record<TemplateBump, number> = { none: 0, patch: 1, minor: 2, major: 3 };

/** Which semver part changed from `a` to `b`. `none` when equal, missing or not semver. */
export function semverBump (a: string | undefined, b: string | undefined): TemplateBump {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa == null || pb == null) return 'none';
  if (pb[0] !== pa[0]) return pb[0] > pa[0] ? 'major' : 'none';
  if (pb[1] !== pa[1]) return pb[1] > pa[1] ? 'minor' : 'none';
  if (pb[2] !== pa[2]) return pb[2] > pa[2] ? 'patch' : 'none';
  return 'none';
}

function parseSemver (v: string | undefined): [number, number, number] | null {
  const m = typeof v === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(v) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// ---------- template → FormSpec ---------- //

export interface TemplateToFormSpecResult {
  formSpec: FormSpec;
  /**
   * Item keys that do not resolve cleanly against the data-model (`unknown`, `deprecated`,
   * `system`). They are kept in the sections (consumers skip what they cannot render) but
   * left out of the permissions; the caller must show them to the data-set owner.
   */
  itemKeyIssues: FormSpecItemKeyIssue[];
}

/**
 * Build the FormSpec a data set starts from.
 *
 * Permissions are derived from the sections' item keys through the data-model
 * (`authorizations.forItemKeys`, level `read`) — a template cannot ask for more. App-private
 * stream refs are carried read-only; other existing-stream refs are carried as declared
 * (they are patched at acceptance, same as an authored FormSpec).
 *
 * @param tpl A template validated by `loadTemplate` / `loadTemplateFromUrl`.
 * @param opts.model Defaults to the initialised singleton.
 * @param opts.source Provenance to store on the FormSpec (URL import).
 */
export function templateToFormSpec (
  tpl: AppTemplate,
  opts: { model?: any; source?: FormSpecSource } = {}
): TemplateToFormSpecResult {
  const model = opts.model ?? getHDSModel();
  const sections: AppTemplateSection[] = tpl.sections.map(s => {
    const out: AppTemplateSection = { key: s.key, type: s.type, name: s.name, itemKeys: [...(s.itemKeys ?? [])] };
    if (s.itemCustomizations && Object.keys(s.itemCustomizations).length > 0) {
      out.itemCustomizations = structuredClone(s.itemCustomizations);
    }
    if (s.customFieldKeys && s.customFieldKeys.length > 0) out.customFieldKeys = [...s.customFieldKeys];
    return out;
  });

  const formSpec: FormSpec = {
    version: 1,
    title: tpl.title,
    description: tpl.description,
    permissions: [],
    sections
  };
  if (tpl.consent != null) formSpec.consent = tpl.consent;
  if (tpl.chat) formSpec.features = { chat: true };
  if (tpl.customFields && tpl.customFields.length > 0) formSpec.customFields = structuredClone(tpl.customFields);
  if (tpl.existingStreamRefs && tpl.existingStreamRefs.length > 0) {
    formSpec.existingStreamRefs = tpl.existingStreamRefs.map(capAppPrivate);
  }
  if (tpl.requiredBridges && tpl.requiredBridges.length > 0) {
    formSpec.appCustomData = { requiredBridges: [...tpl.requiredBridges] };
  }
  if (opts.source) formSpec.source = opts.source;

  const itemKeyIssues = validateFormSpecItemKeys(formSpec, model);
  const excluded = new Set(itemKeyIssues.filter(i => i.reason !== 'deprecated').map(i => i.itemKey));
  const grantable = [...new Set(sections.flatMap(s => s.itemKeys ?? []))].filter(k => !excluded.has(k));
  formSpec.permissions = (model.authorizations.forItemKeys(grantable) as Permission[])
    .map(p => ({ streamId: p.streamId, defaultName: p.defaultName, level: p.level }));
  return { formSpec, itemKeyIssues };
}

/** Provenance record for a FormSpec imported from a published template. */
export async function templateSource (
  tpl: AppTemplate,
  url: string,
  fetchedAt: number = Date.now() / 1000
): Promise<FormSpecSource> {
  const source: FormSpecSource = {
    url,
    templateId: tpl.id,
    scopeHash: await templateScopeHash(tpl),
    fetchedAt
  };
  if (tpl.version != null) source.version = tpl.version;
  if (tpl.app?.publisher != null) source.publisher = tpl.app.publisher;
  return source;
}

// ---------- helpers ---------- //

interface ItemEntry { type: string; sectionKey: string; cust: unknown }

function itemIndex (tpl: AppTemplate): Map<string, ItemEntry> {
  const m = new Map<string, ItemEntry>();
  for (const s of tpl.sections) {
    for (const k of s.itemKeys ?? []) {
      m.set(k, { type: s.type, sectionKey: s.key, cust: (s.itemCustomizations as any)?.[k] });
    }
  }
  return m;
}

function refIndex (refs: ExistingStreamRef[] | undefined): Map<string, string> {
  return new Map((refs ?? []).map(r => [r.streamId, [...r.permissions].sort().join(',')]));
}

function cadenceOf (cust: unknown): unknown {
  if (cust == null || typeof cust !== 'object') return null;
  const c = cust as Record<string, unknown>;
  return { repeatable: c.repeatable ?? null, reminder: c.reminder ?? null, required: c.required ?? null };
}

function textsOf (tpl: AppTemplate): unknown {
  return {
    title: tpl.title,
    description: tpl.description,
    consent: tpl.consent ?? null,
    app: tpl.app ?? null,
    sections: tpl.sections.map(s => [s.key, s.name]),
    refs: (tpl.existingStreamRefs ?? []).map(r => [r.streamId, r.label ?? null, r.purpose ?? null])
  };
}

function capAppPrivate (ref: ExistingStreamRef): ExistingStreamRef {
  const out = structuredClone(ref);
  if (out.purpose === APP_PRIVATE_PURPOSE) out.permissions = ['read'];
  return out;
}

/** JSON with object keys sorted recursively, so equal values compare equal. */
function stable (v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val == null || typeof val !== 'object' || Array.isArray(val)) return val;
    return Object.fromEntries(Object.keys(val).sort().map(k => [k, (val as any)[k]]));
  });
}

function byFirst (a: [string, unknown], b: [string, unknown]): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}
