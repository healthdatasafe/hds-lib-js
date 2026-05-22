/**
 * Canonical constants for the HDS x CMC integration.
 *
 * Centralizes:
 * - **App codes** — the `:_cmc:apps:<code>` namespace identifiers for each
 *   HDS surface (patient app, doctor's collector flow, per-bridge services).
 * - **CMC event types** — the well-known consent trigger/accept types the
 *   CMC plugin emits.
 * - **Stream-ID helpers** — build / extract the `:_cmc:apps:<appCode>:<sub>`
 *   sub-scope pattern used by collector forms and chat anchors.
 *
 * Hoisted in Plan 60 B2 from per-file literals + per-file constants.
 */

/** Locked HDS app codes for the `:_cmc:apps:<appCode>` namespace. */
export const CMC_APP_CODES = {
  /** Patient-side HDS-webapp scope (chats anchor, inbox routing). */
  PATIENT: 'hds-patient',
  /** Doctor-side collector flow scope (form-spec sub-scopes + invites). */
  COLLECTOR: 'hds-collector',
  /** bridge-mira service-account scope (Mira API ingest). */
  BRIDGE_MIRA: 'hds-bridge-mira',
  /** bridge-athena service-account scope (Athena/EHR ingest; CMC wiring pending). */
  BRIDGE_ATHENA: 'hds-bridge-athena'
} as const;

export type CmcAppCode = typeof CMC_APP_CODES[keyof typeof CMC_APP_CODES];

/** Well-known CMC consent event types. */
export const CMC_EVENT_TYPES = {
  /** Doctor's invite trigger event under their collector sub-scope. */
  INVITE_TRIGGER: 'consent/request-cmc',
  /** Patient's accept event (mirrored to the doctor's inbox via the plugin). */
  ACCEPT: 'consent/accept-cmc'
} as const;

export type CmcEventType = typeof CMC_EVENT_TYPES[keyof typeof CMC_EVENT_TYPES];

/**
 * Build `:_cmc:apps:<appCode>:<sub>` — the per-sub-scope stream id used by
 * collector forms (`:<collectorId>`), chat anchors (`:chats:<peerSlug>`), etc.
 *
 * Mirrors the upstream `cmc.appScope(appCode)` builder which only handles the
 * top-level appScope; this helper handles the one-level-deeper case the HDS
 * integration uses pervasively.
 */
export function appSubScope (appCode: string, sub: string): string {
  return ':_cmc:apps:' + appCode + ':' + sub;
}

/**
 * Extract the trailing `<sub>` from a stream id of the form
 * `:_cmc:apps:<appCode>:<sub>` (tolerant of any leading prefix — matches the
 * `^.*?:_cmc:apps:<appCode>:` pattern used in the original sites).
 * Returns the original streamId unchanged if the prefix is not found.
 */
export function extractAppSubScopeSuffix (streamId: string, appCode: string): string {
  const escaped = appCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return streamId.replace(new RegExp('^.*?:_cmc:apps:' + escaped + ':'), '');
}
