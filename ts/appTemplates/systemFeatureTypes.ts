/**
 * System-feature type definitions (Plan 45 §1).
 *
 * `clientData.hdsSystemFeature[<messageType>]` declares which `message/*` impls a
 * stream supports. Like custom fields, an empty `{}` def on a descendant stream is
 * the explicit opt-out marker (§2.4 inheritance).
 */

import { type EmptyDef } from './customFieldTypes.ts';

/** v1 message types (no `-v1` suffix per Plan 45 Q13). Existing `message/hds-chat-v1` is unchanged. */
export type SystemMessageType = 'message/system-alert' | 'message/system-ack';

/** Shape declared on `app-system-out`'s `clientData.hdsSystemFeature['message/system-alert']`. */
export interface HDSSystemAlertDef {
  version: 'v1';
  /** Allowed alert levels. v1 ships all three; templates may restrict. */
  levels?: Array<'info' | 'warning' | 'critical'>;
}

/** Shape declared on `app-system-in`'s `clientData.hdsSystemFeature['message/system-ack']`. */
export interface HDSSystemAckDef {
  version: 'v1';
}

export type HDSSystemFeature = Partial<{
  'message/system-alert': HDSSystemAlertDef | EmptyDef;
  'message/system-ack': HDSSystemAckDef | EmptyDef;
  // Future: 'message/system-reminder', 'message/access-update-request', etc.
}>;
