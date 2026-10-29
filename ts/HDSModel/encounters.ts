import { localizeText } from '../localizeText.ts';
import { getModel } from './HDSModelInitAndSingleton.ts';

/**
 * Care encounters and providers (site-agents#24, data-model ENCOUNTER.md):
 * - `encounter/visit-v1` (a consultation, stay, …), `provider/practitioner-v1` (a person), `provider/organization-v1`
 *   (a practice, clinic, hospital or one of its departments).
 * - Event ids held in content are typed links; each one is mirrored as `clientData.related.<eventId>: true` in the
 *   same write (PROVENANCE.md), so a cohort query finds the link without reading content. The content is
 *   authoritative when the two drift.
 * - A provider's GLN / ZSR identifier is mirrored as `clientData.hdsGln` / `clientData.hdsZsr` (the bare value), the
 *   key a writer looks a provider up by before creating one.
 */

export const ENCOUNTER_VISIT = 'encounter/visit-v1';
export const PROVIDER_PRACTITIONER = 'provider/practitioner-v1';
export const PROVIDER_ORGANIZATION = 'provider/organization-v1';
/** CH Core GLN identifier system. */
export const IDENTIFIER_SYSTEM_GLN = 'urn:oid:2.51.1.3';
/** CH Core ZSR (RCC) identifier system. */
export const IDENTIFIER_SYSTEM_ZSR = 'urn:oid:2.16.756.5.30.1.123.100.2.1.1';
const FILE_XDS = 'file/xds-v1';
/** Item key (and stream id) of `encounter/visit-v1`, whose composite `kind` options label a visit. */
const ENCOUNTER_VISIT_ITEM = 'encounter-visit';

/** A content field holding event ids; array fields are named without an index. */
export type ContentEventIdField = 'supersedes' | 'authors.eventId' | 'encounterId' | 'participants.eventId' | 'serviceProvider.eventId' | 'organizations.eventId';

export interface ContentEventId { field: ContentEventIdField; eventId: string }

interface EncounterEventLike { type?: string; content?: any; clientData?: any }

const PROVIDERS = [PROVIDER_PRACTITIONER, PROVIDER_ORGANIZATION];

/**
 * The eventTypes an id in each field may point at. A participant is a practitioner only: FHIR
 * Encounter.participant.individual is a Practitioner, PractitionerRole or RelatedPerson; an organization goes in
 * `serviceProvider`.
 */
const TARGET_TYPES: Record<ContentEventIdField, string[]> = {
  supersedes: [FILE_XDS],
  'authors.eventId': PROVIDERS,
  encounterId: [ENCOUNTER_VISIT],
  'participants.eventId': [PROVIDER_PRACTITIONER],
  'serviceProvider.eventId': [PROVIDER_ORGANIZATION],
  'organizations.eventId': [PROVIDER_ORGANIZATION]
};

/** The `clientData` key mirroring each identifier system on a provider. */
const PROVIDER_KEYS: Array<{ key: 'hdsGln' | 'hdsZsr'; system: string }> = [
  { key: 'hdsGln', system: IDENTIFIER_SYSTEM_GLN },
  { key: 'hdsZsr', system: IDENTIFIER_SYSTEM_ZSR }
];

function isId (v: unknown): v is string {
  return typeof v === 'string' && v !== '';
}

function isPlainObject (v: unknown): v is Record<string, any> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** The ids in a list, or in `key` of each entry (`[{ eventId: 'a' }, {}]` → `['a']`). */
function idsIn (list: unknown, key: string | null): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((v) => key == null ? v : v?.[key]).filter(isId);
}

/**
 * The event ids an event holds in its content, by field, in content order: on `file/xds-v1` `supersedes[]`,
 * `authors[].eventId`, `encounterId`; on `encounter/visit-v1` `participants[].eventId`, `serviceProvider.eventId`;
 * on `provider/practitioner-v1` `organizations[].eventId`. Empty for any other type.
 */
export function contentEventIds (event: EncounterEventLike): ContentEventId[] {
  const c = event?.content;
  if (!isPlainObject(c)) return [];
  const out: ContentEventId[] = [];
  const add = (field: ContentEventIdField, ids: string[]) => { for (const eventId of ids) out.push({ field, eventId }); };
  switch (event.type) {
    case FILE_XDS:
      add('supersedes', idsIn(c.supersedes, null));
      add('authors.eventId', idsIn(c.authors, 'eventId'));
      add('encounterId', isId(c.encounterId) ? [c.encounterId] : []);
      break;
    case ENCOUNTER_VISIT:
      add('participants.eventId', idsIn(c.participants, 'eventId'));
      add('serviceProvider.eventId', isId(c.serviceProvider?.eventId) ? [c.serviceProvider.eventId] : []);
      break;
    case PROVIDER_PRACTITIONER:
      add('organizations.eventId', idsIn(c.organizations, 'eventId'));
      break;
  }
  return out;
}

/** The values of a provider's identifiers in `system`. */
function identifierValues (content: any, system: string): string[] {
  if (!Array.isArray(content?.identifiers)) return [];
  return content.identifiers.filter((i: any) => i?.system === system).map((i: any) => i.value).filter(isId);
}

/**
 * The `clientData` to write with an event (create or update, written whole), with its content links mirrored. Pure:
 * the event is not changed, every other `clientData` key and every other `related` key is kept.
 * - each event id in content (`contentEventIds`) is set as `related.<eventId>: true`;
 * - on an update, pass the event with its stored `clientData`, and the stored content as `previousContent`: the
 *   `related` keys of ids it held and the new content no longer holds are removed (only those: a `related` key never
 *   held in content is another link and stays). Without both, a removed `hdsGln` / `hdsZsr` gets no `null` and the
 *   server keeps it;
 * - on a provider, `hdsGln` / `hdsZsr` are the value of its GLN / ZSR identifier (an existing value is kept when it
 *   is still one of them, else the first), removed when it has none. On an update (`previousContent` given) a removed
 *   key is set to `null`: `events.update` merges top-level `clientData` keys and only `null` deletes one (open-pryv.io
 *   `mergeClientDataMap`). `related` is always written whole, so its removed keys need no `null`.
 */
export function withRelatedMirror (event: EncounterEventLike, previousContent?: any): Record<string, any> {
  const clientData: Record<string, any> = isPlainObject(event?.clientData) ? { ...event.clientData } : {};
  const ids = contentEventIds(event).map((r) => r.eventId);
  const stale = previousContent === undefined
    ? []
    : contentEventIds({ type: event?.type, content: previousContent }).map((r) => r.eventId).filter((id) => !ids.includes(id));
  if (ids.length > 0 || stale.length > 0) {
    const related: Record<string, any> = isPlainObject(clientData.related) ? { ...clientData.related } : {};
    for (const id of stale) delete related[id];
    for (const id of ids) related[id] = true;
    clientData.related = related;
  }
  if (PROVIDERS.includes(event?.type as string)) {
    for (const { key, system } of PROVIDER_KEYS) {
      const values = identifierValues(event.content, system);
      if (values.length === 0) {
        if (previousContent !== undefined && clientData[key] != null) clientData[key] = null;
        else delete clientData[key];
      } else if (!values.includes(clientData[key])) clientData[key] = values[0];
    }
  }
  return clientData;
}

export interface RelatedMirrorIssue {
  code: 'missing-related' | 'wrong-target-type' | 'missing-provider-key' | 'stale-provider-key';
  /** The content field holding the id (`missing-related`, `wrong-target-type`). */
  field?: ContentEventIdField;
  eventId?: string;
  /** The type of the event the id points at, and the types the field expects (`wrong-target-type`). */
  targetType?: string;
  expectedTypes?: string[];
  /**
   * The provider key, and an identifier value it should hold (`missing-provider-key`) or the value it holds that no
   * identifier does (`stale-provider-key`).
   */
  key?: 'hdsGln' | 'hdsZsr';
  value?: string;
}

type TargetsLike = Map<string, { type?: string } | null | undefined> | Record<string, { type?: string } | null | undefined>;

/**
 * Mirror checks the schema cannot make, warnings for the writer (`withRelatedMirror` fixes all but
 * `wrong-target-type`):
 * - `missing-related`: an event id in content without its `clientData.related.<eventId>: true`;
 * - `wrong-target-type` (only with `targets`, the referenced events by id): the event an id points at has a type the
 *   field does not accept (participants: a practitioner; authors: a practitioner or an organization; serviceProvider
 *   and organizations: an organization; encounterId: a visit; supersedes: a document). An id missing from `targets`
 *   (deleted, unreadable, not fetched) is not an issue: a reader shows what the event itself says;
 * - `missing-provider-key`: a provider with a GLN / ZSR identifier and no `clientData.hdsGln` / `hdsZsr`;
 * - `stale-provider-key`: a provider whose `clientData.hdsGln` / `hdsZsr` is set to a value no identifier of that
 *   system holds. It would send another writer's lookup to the wrong provider.
 */
export function checkRelatedMirror (event: EncounterEventLike, targets?: TargetsLike): RelatedMirrorIssue[] {
  const issues: RelatedMirrorIssue[] = [];
  const related = isPlainObject(event?.clientData?.related) ? event.clientData.related : {};
  const targetOf = (id: string) => targets instanceof Map ? targets.get(id) : targets?.[id];
  for (const { field, eventId } of contentEventIds(event)) {
    if (related[eventId] !== true) issues.push({ code: 'missing-related', field, eventId });
    const target = targets == null ? null : targetOf(eventId);
    if (target == null) continue;
    const expectedTypes = TARGET_TYPES[field];
    if (!expectedTypes.includes(target.type as string)) {
      issues.push({ code: 'wrong-target-type', field, eventId, targetType: target.type, expectedTypes });
    }
  }
  if (PROVIDERS.includes(event?.type as string)) {
    for (const { key, system } of PROVIDER_KEYS) {
      const values = identifierValues(event.content, system);
      const held = event.clientData?.[key];
      if (held != null) {
        if (!values.includes(held)) issues.push({ code: 'stale-provider-key', key, value: held });
      } else if (values.length > 0) {
        issues.push({ code: 'missing-provider-key', key, value: values[0] });
      }
    }
  }
  return issues;
}

/** Visit kinds, for a model without the `encounter-visit` item (labels as the item's, data-model ENCOUNTER.md). */
const KIND_LABELS: Record<string, { en: string; fr: string }> = {
  consultation: { en: 'Consultation', fr: 'Consultation' },
  'hospital-stay': { en: 'Hospital stay', fr: 'Séjour hospitalier' },
  emergency: { en: 'Emergency', fr: 'Urgence' },
  'day-case': { en: 'Day hospital', fr: 'Hôpital de jour' },
  teleconsultation: { en: 'Teleconsultation', fr: 'Téléconsultation' },
  'home-visit': { en: 'Home visit', fr: 'Visite à domicile' },
  other: { en: 'Other', fr: 'Autre' }
};

function labelText (label: any): string | null {
  if (typeof label === 'string') return label || null;
  try {
    return localizeText(label) || null;
  } catch { /* a label without `en`: not usable */ }
  return null;
}

/** The label of a visit kind: the item's `kind` option, else the built-in label, else the kind itself. */
function kindLabel (kind: string, itemDef: any, model: any): string {
  let item = itemDef?.data?.composite?.kind ? itemDef : null;
  if (item == null) {
    try {
      item = model?.itemsDefs.forKey(ENCOUNTER_VISIT_ITEM, false);
    } catch { /* model not loaded */ }
  }
  const options = item?.data?.composite?.kind?.options;
  const option = Array.isArray(options) ? options.find((o: any) => o?.value === kind) : null;
  const builtIn = Object.prototype.hasOwnProperty.call(KIND_LABELS, kind) ? KIND_LABELS[kind] : null;
  return labelText(option?.label) ?? (builtIn ? localizeText(builtIn) : kind);
}

function codingDisplay (coding: any): string | null {
  return typeof coding?.display === 'string' && coding.display.trim() !== '' ? coding.display.trim() : null;
}

function joinParts (parts: Array<string | null>): string | null {
  const present = parts.filter((p): p is string => p != null && p !== '');
  return present.length > 0 ? present.join(' · ') : null;
}

/**
 * Short text of an encounter or provider event, keyed on the eventType so it reads the same with or without the
 * item loaded: a visit "Hospital stay · Cardiology" (kind label, specialty display), a practitioner
 * "Dr Anne Muller · Cardiology" (name, first of `specialties` as printed), an organization its name. Null for another
 * type or nothing to show.
 */
export function encounterShortText (event: EncounterEventLike, itemDef: any = null, model: any = getModel()): string | null {
  const c = event?.content;
  if (!isPlainObject(c)) return null;
  switch (event.type) {
    case ENCOUNTER_VISIT:
      return joinParts([isId(c.kind) ? kindLabel(c.kind, itemDef, model) : null, codingDisplay(c.specialty)]);
    case PROVIDER_PRACTITIONER: {
      const name = isId(c.name) ? c.name : ([c.given, c.family].filter(isId).join(' ') || null);
      return joinParts([name, codingDisplay(Array.isArray(c.specialties) ? c.specialties[0] : null)]);
    }
    case PROVIDER_ORGANIZATION:
      return isId(c.name) ? c.name : null;
  }
  return null;
}
