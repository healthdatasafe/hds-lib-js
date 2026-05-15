import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';

/**
 * System-alert helper (Plan 59 Phase 4d).
 *
 * Thin wrappers around the `notification/alert-cmc` + `notification/ack-cmc`
 * event types on a CMC consent's collectors anchor stream
 * (`pryv.cmc.collectorStreamUnder(scopeStreamId, peerSlug)`).
 *
 * These are the system-channel equivalent of chat: an automated party
 * sends an alert to the human side, the human acknowledges. Used for
 * (e.g.) bridge anomaly notifications, study reminders, scope-update
 * announcements.
 *
 * Pure functions — both `CmcCollectorClient` (patient side) and
 * `CmcBridgeAccess` / `CmcCollector` (requester side) call into here.
 */

export interface SystemAlertContent {
  /** Application-defined short code (e.g. 'study-reminder', 'data-stale'). */
  code: string;
  /** Per-locale human-readable body — REQUIRED by the plugin schema. */
  body: { [locale: string]: string };
  /** Per-locale human-readable title (optional). */
  title?: { [locale: string]: string };
  /** Severity hint — caller-defined. Common: 'info' | 'warning' | 'critical'. */
  level?: string;
  /** Free-form additional payload. */
  data?: Record<string, any>;
  /** Marks the alert as requiring an explicit acknowledgement. */
  requiresAck?: boolean;
}

export interface SystemAckContent {
  /** Plugin schema field — application-defined unique id for this ack. */
  ackId: string;
  /** Plugin schema field — id of the alert event being acknowledged. */
  alertEventId: string;
  /** Optional per-locale note from the acker. */
  note?: { [locale: string]: string };
}

export interface SendSystemEventParams {
  connection: pryv.Connection;
  /** Scope stream id (`:_cmc:apps:<app>:<sub-path>`). */
  scopeStreamId: string;
  /** Slug of the recipient peer (computed from their {username, host}). */
  peerSlug: string;
}

/**
 * Send a `notification/alert-cmc` to the peer's collectors anchor.
 * Returns the created event.
 */
export async function sendSystemAlert (
  params: SendSystemEventParams & { content: SystemAlertContent }
): Promise<pryv.Event> {
  validateSendParams(params);
  if (!params?.content?.code) throw new HDSLibError('sendSystemAlert: content.code required');
  if (!params?.content?.body) throw new HDSLibError('sendSystemAlert: content.body required (plugin schema)');

  const collectorsStreamId = pryv.cmc.collectorStreamUnder(params.scopeStreamId, params.peerSlug);
  const res = await params.connection.api([{
    method: 'events.create',
    params: {
      streamIds: [collectorsStreamId],
      type: pryv.cmc.ET_SYSTEM_ALERT,
      content: params.content
    }
  }]);
  const event = (res?.[0] as any)?.event;
  if (event == null) {
    const err = (res?.[0] as any)?.error;
    throw new HDSLibError('sendSystemAlert failed: ' + JSON.stringify(err));
  }
  return event;
}

/**
 * Send a `notification/ack-cmc` to acknowledge a previously-received alert.
 */
export async function sendSystemAck (
  params: SendSystemEventParams & { content: SystemAckContent }
): Promise<pryv.Event> {
  validateSendParams(params);
  if (!params?.content?.ackId) throw new HDSLibError('sendSystemAck: content.ackId required');
  if (!params?.content?.alertEventId) throw new HDSLibError('sendSystemAck: content.alertEventId required');

  const collectorsStreamId = pryv.cmc.collectorStreamUnder(params.scopeStreamId, params.peerSlug);
  const res = await params.connection.api([{
    method: 'events.create',
    params: {
      streamIds: [collectorsStreamId],
      type: pryv.cmc.ET_SYSTEM_ACK,
      content: params.content
    }
  }]);
  const event = (res?.[0] as any)?.event;
  if (event == null) {
    const err = (res?.[0] as any)?.error;
    throw new HDSLibError('sendSystemAck failed: ' + JSON.stringify(err));
  }
  return event;
}

/**
 * Read system events on the local collectors anchor for a given peer.
 * Returns alerts and/or acks per `types` parameter (default: both).
 */
export async function getSystemEvents (
  params: SendSystemEventParams & {
    types?: Array<'alert' | 'ack'>;
    limit?: number;
  }
): Promise<pryv.Event[]> {
  validateSendParams(params);
  const collectorsStreamId = pryv.cmc.collectorStreamUnder(params.scopeStreamId, params.peerSlug);
  const wireTypes = (params.types ?? ['alert', 'ack']).map((t) =>
    t === 'alert' ? pryv.cmc.ET_SYSTEM_ALERT : pryv.cmc.ET_SYSTEM_ACK);
  const res = await params.connection.api([{
    method: 'events.get',
    params: { streams: [collectorsStreamId], types: wireTypes, limit: params.limit ?? 100 }
  }]);
  return (res?.[0] as any)?.events ?? [];
}

function validateSendParams (params: SendSystemEventParams): void {
  if (!params?.connection) throw new HDSLibError('connection required');
  if (!params?.scopeStreamId) throw new HDSLibError('scopeStreamId required');
  if (!params?.peerSlug) throw new HDSLibError('peerSlug required');
}
