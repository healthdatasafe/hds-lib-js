/**
 * Plan 59 Phase 5a/5b — FormSpec helpers for the HDS x CMC integration.
 *
 * The FormSpec is HDS's data-set template (title, description, consent,
 * permissions, sections, custom-field/existing-stream refs, features).
 * It lives independently of CMC, but is consumed at invite-time to
 * derive the CMC `requestedPermissions` and is mirrored as a snapshot
 * onto the per-invite trigger event content (Q-F6 lock: snapshot-frozen).
 *
 * Storage (Q-F5 lock: hds:form-spec-v1):
 * - **Doctor side**: one canonical template event per data-set, stored
 *   on the doctor's `:_cmc:apps:hds-collector:<collectorId>` scope stream.
 * - **Per-invite snapshot**: doctor's `consent/request-cmc` trigger event
 *   carries `content.hdsFormSpec: <full snapshot>` (Candidate C). Q-F2
 *   lock confirms the plugin accepts unknown content keys.
 * - **Patient side**: mirrored to the patient's own `consent/accept-cmc`
 *   event content via `mirrorFormSpecOnAcceptEvent` post-accept (post-
 *   acceptInvite the trigger event becomes unreachable from the patient
 *   side, so the snapshot must live with the patient's accept event).
 *
 * Chat-only data sets (Q-F4 lock): when a FormSpec has no real
 * permissions, `deriveCmcPermissions` injects the `:hds:noop` placeholder
 * so `cmc.createInvite`'s non-empty-permissions check passes. The
 * patient's hds-webapp provisions `:hds:noop` on first launch.
 */

import { cmc, pryv } from '../patchedPryv.ts';
import { CMC_APP_CODES, CMC_EVENT_TYPES, appSubScope, extractAppSubScopeSuffix } from './constants.ts';
import type { Permission } from '../appTemplates/interfaces.ts';
import type { localizableText } from '../localizeText.ts';
import type {
  AppTemplateSection,
  CustomFieldDeclaration,
  ExistingStreamRef
} from '../appTemplates/templateTypes.ts';

/** Event type for the canonical FormSpec template event on the doctor side. */
export const FORM_SPEC_EVENT_TYPE = 'hds:form-spec-v1';

/** The HDS no-op permission stream — see Q-F3/F4 in the FormSpec design brief. */
export const HDS_NOOP_STREAM_ID = 'hds-noop';

/** Permission level used by the chat-only placeholder. Read on an empty stream is a no-op. */
export const HDS_NOOP_PERMISSION: Permission = { streamId: HDS_NOOP_STREAM_ID, level: 'read' };

/**
 * The full HDS FormSpec — what FormBuilder authors, what gets snapshotted
 * onto each `consent/request-cmc` trigger event, and what the patient
 * sees mirrored on their own `consent/accept-cmc` event.
 */
export interface FormSpec {
  version: 1;
  title: localizableText;
  description: localizableText;
  consent?: localizableText;
  /** Permissions the doctor asks for. May be empty for chat-only data sets. */
  permissions: Permission[];
  /** Sections shown to the patient on the Tasks / Chat pages. */
  sections: AppTemplateSection[];
  /** Optional feature gates (chat is independent — it's CMC-level). */
  features?: { chat?: boolean };
  /** Optional provision-new declarations (Plan 45 §2.9 mode-2). */
  customFields?: CustomFieldDeclaration[];
  /** Optional existing-stream-refs (Plan 45 §2.9 mode-3). */
  existingStreamRefs?: ExistingStreamRef[];
  /** Optional HDS-specific app metadata (e.g. requiredBridges). */
  appCustomData?: {
    requiredBridges?: string[];
    [key: string]: any;
  };
}

/**
 * Idempotent upsert of the canonical FormSpec event on the doctor's CMC
 * scope stream. One event per data-set. Re-saving with the same
 * collectorScopeStreamId updates the existing event in place.
 *
 * @param connection Doctor's master connection.
 * @param collectorScopeStreamId `:_cmc:apps:hds-collector:<collectorId>` (must already exist).
 * @param formSpec The FormSpec to persist.
 * @returns The created or updated event.
 */
export async function saveFormSpec (
  connection: pryv.Connection,
  collectorScopeStreamId: string,
  formSpec: FormSpec
): Promise<pryv.Event> {
  if (formSpec.version !== 1) {
    throw new Error(`saveFormSpec: unsupported FormSpec version ${formSpec.version}`);
  }
  const existing = await loadFormSpec(connection, collectorScopeStreamId);
  if (existing) {
    return await connection.apiOne('events.update', {
      id: existing.id,
      update: { content: formSpec }
    }, 'event');
  }
  return await connection.apiOne('events.create', {
    streamIds: [collectorScopeStreamId],
    type: FORM_SPEC_EVENT_TYPE,
    content: formSpec
  }, 'event');
}

/**
 * Read the canonical FormSpec event from the doctor's CMC scope stream.
 * Returns null if no event exists yet (fresh data-set).
 */
export async function loadFormSpec (
  connection: pryv.Connection,
  collectorScopeStreamId: string
): Promise<pryv.Event | null> {
  const events = await connection.apiOne('events.get', {
    streams: [collectorScopeStreamId],
    types: [FORM_SPEC_EVENT_TYPE],
    limit: 1
  }, 'events') as any[];
  return (events && events.length > 0) ? events[0] : null;
}

/**
 * A FormSpec persisted on the doctor's `:_cmc:apps:<appCode>:<collectorId>`
 * scope, paired with the raw event id + the parsed collectorId. Returned by
 * `listFormSpecs` and `getFormSpecById`.
 *
 * Phase C (plan 61): replaces the legacy `Collector` runtime as the doctor-
 * side data-set handle. Every record is "published" — there is no draft
 * state in the CMC FormSpec model; `saveFormSpec` writes the canonical event
 * immediately.
 */
export interface FormSpecRecord {
  /** The collectorId suffix of the scope stream (the doctor's data-set id). */
  collectorId: string;
  /** The FormSpec content as authored. */
  formSpec: FormSpec;
  /** The raw `hds:form-spec-v1` event (id, modified, etc.). */
  event: pryv.Event;
}

/**
 * Pure helper: lift a raw `hds:form-spec-v1` event onto its scope-stream
 * `collectorId`. Exported for unit-testing in isolation from the I/O layer.
 *
 * @param event   a `hds:form-spec-v1` event read from a `:_cmc:apps:<appCode>:*` stream.
 * @param appCode defaults to `CMC_APP_CODES.COLLECTOR`.
 */
export function eventToFormSpecRecord (
  event: pryv.Event,
  appCode: string = CMC_APP_CODES.COLLECTOR
): FormSpecRecord {
  const streamIds = ((event as any).streamIds || []) as string[];
  const marker = ':_cmc:apps:' + appCode + ':';
  const subScope = streamIds.find(s => s.indexOf(marker) !== -1) ?? streamIds[0] ?? '';
  const collectorId = extractAppSubScopeSuffix(subScope, appCode);
  return {
    collectorId,
    formSpec: (event as any).content as FormSpec,
    event
  };
}

/**
 * Doctor-side: list every FormSpec the doctor owns under their
 * `:_cmc:apps:<appCode>` scope (one per data-set). Every result is
 * "published" — saveFormSpec writes the canonical event immediately
 * (no draft state in the CMC model).
 *
 * Phase C (plan 61): replaces `appManaging.getCollectors()`.
 */
export async function listFormSpecs (
  connection: pryv.Connection,
  opts?: { appCode?: string; limit?: number }
): Promise<FormSpecRecord[]> {
  const appCode = opts?.appCode ?? CMC_APP_CODES.COLLECTOR;
  const parentStream = cmc.appScope(appCode);
  const events = await connection.apiOne('events.get', {
    streams: [parentStream],
    types: [FORM_SPEC_EVENT_TYPE],
    limit: opts?.limit ?? 1000
  } as any, 'events') as unknown as pryv.Event[];
  return (events ?? []).map(e => eventToFormSpecRecord(e, appCode));
}

/**
 * Doctor-side: load a single FormSpec by its `collectorId`. Returns null
 * if no FormSpec event exists yet on `:_cmc:apps:<appCode>:<collectorId>`.
 *
 * Phase C (plan 61): replaces `appManaging.getCollectorById()`.
 */
export async function getFormSpecById (
  connection: pryv.Connection,
  collectorId: string,
  opts?: { appCode?: string }
): Promise<FormSpecRecord | null> {
  const appCode = opts?.appCode ?? CMC_APP_CODES.COLLECTOR;
  const subScope = appSubScope(appCode, collectorId);
  const event = await loadFormSpec(connection, subScope);
  if (!event) return null;
  return eventToFormSpecRecord(event, appCode);
}

/**
 * Doctor-side: mint a CMC invite with the FormSpec snapshot embedded on
 * the trigger event content at events.create time.
 *
 * **Critical:** this is the ONLY way to get the snapshot to propagate
 * to the patient's capability access. The CMC plugin's capability-mint
 * hook copies the trigger event content into a separate offer event
 * (under `:_cmc:_internal:offer:<capId>`) AT MINT TIME — once. Later
 * `events.update` on the trigger event does NOT update the offer event,
 * so `cmc.readOffer` (which reads the offer event) won't see anything
 * stamped post-mint. (Verified by `verify-formspec.mjs` 2026-05-21.)
 *
 * Therefore we bypass `cmc.createInvite` (which doesn't accept arbitrary
 * extra content keys) and call `events.create` directly with `hdsFormSpec`
 * already in content. The capability-mint hook fires inside the
 * events.create chain, copies the content (including hdsFormSpec) to
 * the offer event, and stamps capabilityUrl + capabilityAccessId +
 * capabilityExpiresAt on the returned event.
 *
 * @returns the same shape as `cmc.createInvite` for caller compatibility.
 */
export async function createInviteWithFormSpec (
  connection: pryv.Connection,
  params: {
    appCode: string;
    scopeStreamId: string;
    displayName: string;
    requestedPermissions: Permission[];
    formSpec: FormSpec;
    mode?: 'single-use' | 'open-link';
    expiresAt?: number;
    title?: localizableText;
    description?: localizableText;
    consent?: localizableText;
    features?: { chat?: boolean; systemMessaging?: boolean };
    requesterMeta?: Record<string, any>;
    to?: string | null;
  }
): Promise<{ inviteEventId: string; capabilityUrl: string; mode: string; expiresAt: number | undefined }> {
  const requesterMeta = Object.assign(
    { displayName: params.displayName, appId: params.appCode },
    params.requesterMeta ?? {}
  );
  const request: any = {
    title: params.title ?? params.formSpec.title ?? { en: params.displayName },
    description: params.description ?? params.formSpec.description ?? { en: '' },
    consent: params.consent ?? params.formSpec.consent ?? { en: '' },
    permissions: params.requestedPermissions
  };
  if (params.features) request.features = params.features;
  if (params.expiresAt) request.expiresAt = params.expiresAt;
  const content: any = {
    to: params.to === undefined ? null : params.to,
    capabilityRequested: true,
    request,
    requesterMeta,
    // HDS-extension: snapshot the FormSpec on the trigger event content
    // so the capability-mint hook copies it into the offer event.
    hdsFormSpec: params.formSpec
  };
  if (params.mode && params.mode !== 'single-use') {
    content.capability = { mode: params.mode };
  }
  const event = await connection.apiOne('events.create', {
    streamIds: [params.scopeStreamId],
    type: CMC_EVENT_TYPES.INVITE_TRIGGER,
    content
  } as any, 'event') as any;
  return {
    inviteEventId: event.id,
    capabilityUrl: event?.content?.capabilityUrl,
    mode: event?.content?.capability?.mode ?? params.mode ?? 'single-use',
    expiresAt: event?.content?.capabilityExpiresAt ?? event?.content?.request?.expiresAt
  };
}

/**
 * Patient-side: mirror the FormSpec snapshot onto the patient's own
 * `consent/accept-cmc` event content post-accept. Without this the
 * snapshot is unreachable on the patient side (the doctor's trigger
 * event is gone behind the consumed capability).
 *
 * @param connection Patient's master connection.
 * @param acceptEventId The patient's accept event id (from `cmc.acceptInvite`'s return).
 * @param formSpec Snapshot read pre-accept (e.g. via `readOfferWithFormSpec`).
 */
export async function mirrorFormSpecOnAcceptEvent (
  connection: pryv.Connection,
  acceptEventId: string,
  formSpec: FormSpec
): Promise<pryv.Event> {
  const current = await connection.apiOne('events.getOne', {
    id: acceptEventId
  }, 'event') as any;
  const mergedContent = { ...(current?.content || {}), hdsFormSpec: formSpec };
  return await connection.apiOne('events.update', {
    id: acceptEventId,
    update: { content: mergedContent } as any
  }, 'event');
}

/**
 * Patient-side: pre-accept, read the full offer trigger-event content
 * including any `hdsFormSpec` snapshot. The SDK's `cmc.readOffer` filters
 * to a fixed shape and drops HDS-extension fields, so this is a thin
 * variant that returns the raw content.
 *
 * Single-use capabilities consume on accept — call this BEFORE `cmc.acceptInvite`.
 */
export async function readOfferWithFormSpec (
  capabilityUrl: string,
  opts?: { pryv?: any }
): Promise<{ content: any; hdsFormSpec: FormSpec | null }> {
  const pryvMod = (opts && opts.pryv) || (pryv as any);
  const cap = new pryvMod.Connection(capabilityUrl);
  const events = await cap.apiOne('events.get', {
    types: [CMC_EVENT_TYPES.INVITE_TRIGGER],
    limit: 1
  }, 'events') as any[];
  if (!events || events.length === 0) {
    throw new Error('readOfferWithFormSpec: capability offer stream empty');
  }
  const content = events[0]?.content || {};
  return {
    content,
    hdsFormSpec: content.hdsFormSpec ?? null
  };
}

/**
 * Derive the `requestedPermissions` array for `cmc.createInvite` from a
 * FormSpec. If the FormSpec has no real permissions (chat-only data set),
 * inject the `hds-noop` placeholder so the CMC schema's non-empty-
 * permissions check passes (Q-F4 lock).
 *
 * The placeholder grants `read` on an empty patient-side stream — a
 * functional no-op. The patient's hds-webapp provisions `hds-noop` at
 * first launch (Q-F3: patient-only).
 *
 * Note: the stream is plain `hds-noop` (no colon prefix) — `:hds:` is
 * not a registered system-stream namespace on open-pryv.io, so the
 * api-server's streams.create rejects `:hds:noop` with `invalid-request-
 * structure`. A regular user stream works fine.
 */
export function deriveCmcPermissions (formSpec: FormSpec): Permission[] {
  const perms = (formSpec.permissions || []).filter(p => p && p.streamId && p.level);
  if (perms.length > 0) return perms;
  return [{ ...HDS_NOOP_PERMISSION }];
}

/**
 * Patient-side: provision the `hds-noop` stream used by the chat-only
 * placeholder permission. Idempotent — re-runs OK.
 */
export async function provisionHdsNoop (connection: pryv.Connection): Promise<void> {
  try {
    await connection.apiOne('streams.create', {
      id: HDS_NOOP_STREAM_ID,
      name: 'HDS no-op (CMC chat-only placeholder)'
    });
  } catch (e: any) {
    const code = e?.innerObject?.id ?? e?.id;
    if (code === 'item-already-exists') return;
    throw e;
  }
}

/**
 * Doctor-side helper: did the FormSpec produce a chat-only invite (i.e.
 * its only granted permission is `:hds:noop`)? Used by listInviteRecordsFor
 * + PatientsTable to surface "chat-only relationship" badges.
 */
export function isChatOnlyFormSpec (formSpec: FormSpec | null | undefined): boolean {
  if (!formSpec) return false;
  const perms = (formSpec.permissions || []).filter(p => p && p.streamId && p.level);
  return perms.length === 0;
}
