/**
 * Data-export requests over the CMC system channel.
 *
 * GDPR / HIPAA portability: a patient asks the doctor for an export of the data
 * the doctor holds on them, and the doctor marks the request fulfilled. Today this
 * is an out-of-band email; here it is a structured, auditable exchange.
 *
 * No new event type: the CMC plugin only forwards its own types, so the request
 * travels as a `notification/alert-cmc` (with `ackRequired`) and the fulfilment as
 * the matching `notification/ack-cmc`. The plugin validates `level`, `title`,
 * `body`, `ackRequired`, `ackId` and delivers every other content key verbatim,
 * which is where the typed part lives:
 *
 *   content.hds = { kind: 'data-export-request', requestedAt, dueAt?, note? }
 *
 * Both sides use the same helpers on their OWN per-counterparty collectors stream
 * (`<scope>:collectors:<peerSlug>`): the patient writes the alert there (the plugin
 * delivers it to the doctor's collectors stream for the patient), the doctor writes
 * the ack on its side (delivered back). Incoming events carry `content.from`
 * stamped by the plugin; outgoing ones do not.
 *
 * Documented in data-model `documentation/CUSTOM-FIELDS-AND-SYSTEM.md`.
 */

import { pryv } from '../patchedPryv.ts';

export const DATA_EXPORT_KIND = 'data-export-request';
/** `ackId` prefix that marks an alert as a data-export request (the `hds` block is authoritative). */
export const DATA_EXPORT_ACK_PREFIX = 'hds-data-export:';
export const ET_ALERT = 'notification/alert-cmc';
export const ET_ACK = 'notification/ack-cmc';

export interface DataExportRequestParams {
  /** Own `<scope>:collectors:<peerSlug>` stream (patient side: `CmcRelationship.localCollectorStreamId`). */
  collectorStreamId: string;
  /** Unix seconds; defaults to now. */
  requestedAt?: number;
  /** Unix seconds; optional deadline the requester proposes. */
  dueAt?: number | null;
  /** Free text for the doctor. */
  note?: string | null;
  /** Language of the human-readable title/body (defaults to `en`). */
  locale?: string;
}

export interface DataExportRequest {
  alertEventId: string;
  ackId: string;
  requestedAt: number;
  dueAt: number | null;
  note: string | null;
  /** `received` when the alert carries `content.from` (delivered by the peer), else `sent`. */
  direction: 'sent' | 'received';
  /** Peer identity for received requests. */
  from: { username: string; host: string } | null;
  status: 'pending' | 'fulfilled';
  fulfilledAt: number | null;
  ackEventId: string | null;
}

/** Alert content for a data-export request. Exported for tests and custom senders. */
export function buildDataExportRequestContent (params: Omit<DataExportRequestParams, 'collectorStreamId'> & { ackId?: string }): Record<string, unknown> {
  const requestedAt = params.requestedAt ?? Math.floor(Date.now() / 1000);
  const ackId = params.ackId ?? DATA_EXPORT_ACK_PREFIX + randomId();
  const locale = params.locale || 'en';
  const lines = [TEXT[locale]?.body ?? TEXT.en.body];
  if (params.dueAt != null) lines.push((TEXT[locale]?.due ?? TEXT.en.due) + ' ' + new Date(params.dueAt * 1000).toISOString().slice(0, 10));
  if (params.note) lines.push(params.note);
  return {
    level: 'info',
    title: { [locale]: TEXT[locale]?.title ?? TEXT.en.title },
    body: { [locale]: lines.join('\n') },
    ackRequired: true,
    ackId,
    hds: {
      kind: DATA_EXPORT_KIND,
      requestedAt,
      ...(params.dueAt != null ? { dueAt: params.dueAt } : {}),
      ...(params.note ? { note: params.note } : {})
    }
  };
}

/** Patient side: post the request on the own collectors stream; the plugin delivers it to the doctor. */
export async function requestDataExport (connection: pryv.Connection, params: DataExportRequestParams): Promise<{ alertEventId: string; ackId: string }> {
  if (!params?.collectorStreamId) throw new Error('requestDataExport: collectorStreamId is required');
  const content = buildDataExportRequestContent(params);
  const event = await connection.apiOne('events.create', {
    streamIds: [params.collectorStreamId],
    type: ET_ALERT,
    content
  }, 'event') as { id: string };
  return { alertEventId: event.id, ackId: content.ackId as string };
}

/** Doctor side: acknowledge a received request; the plugin delivers the ack to the patient. */
export async function fulfillDataExportRequest (connection: pryv.Connection, params: { collectorStreamId: string; alertEventId: string; ackId: string }): Promise<{ ackEventId: string }> {
  if (!params?.collectorStreamId || !params.alertEventId || !params.ackId) {
    throw new Error('fulfillDataExportRequest: collectorStreamId, alertEventId and ackId are required');
  }
  const event = await connection.apiOne('events.create', {
    streamIds: [params.collectorStreamId],
    type: ET_ACK,
    content: { alertEventId: params.alertEventId, ackId: params.ackId }
  }, 'event') as { id: string };
  return { ackEventId: event.id };
}

/** Either side: the data-export requests on one collectors stream, newest first, joined with their acks. */
export async function listDataExportRequests (connection: pryv.Connection, collectorStreamId: string, opts: { limit?: number } = {}): Promise<DataExportRequest[]> {
  const events = await connection.apiOne('events.get', {
    streams: [collectorStreamId],
    types: [ET_ALERT, ET_ACK],
    limit: opts.limit ?? 500,
    sortAscending: false
  }, 'events') as Array<{ id: string; type: string; time?: number; content?: Record<string, any> }>;
  return parseDataExportEvents(events);
}

/** Pure join of alert + ack events into request records (exported for tests). */
export function parseDataExportEvents (events: Array<{ id: string; type: string; time?: number; content?: Record<string, any> | null }>): DataExportRequest[] {
  const acks = new Map<string, { id: string; time: number }>();
  for (const e of events) {
    if (e.type !== ET_ACK) continue;
    const c = e.content || {};
    for (const key of [c.ackId, c.alertEventId]) {
      if (typeof key === 'string' && key.length > 0 && !acks.has(key)) acks.set(key, { id: e.id, time: e.time ?? 0 });
    }
  }
  const out: DataExportRequest[] = [];
  for (const e of events) {
    if (e.type !== ET_ALERT) continue;
    const c = e.content || {};
    const hds = c.hds;
    const isExport = (hds && hds.kind === DATA_EXPORT_KIND) || (typeof c.ackId === 'string' && c.ackId.startsWith(DATA_EXPORT_ACK_PREFIX));
    if (!isExport) continue;
    const ackId = typeof c.ackId === 'string' ? c.ackId : '';
    const ack = acks.get(ackId) ?? acks.get(e.id) ?? null;
    const from = c.from && typeof c.from.username === 'string' ? { username: c.from.username, host: String(c.from.host ?? '') } : null;
    out.push({
      alertEventId: e.id,
      ackId,
      requestedAt: typeof hds?.requestedAt === 'number' ? hds.requestedAt : (e.time ?? 0),
      dueAt: typeof hds?.dueAt === 'number' ? hds.dueAt : null,
      note: typeof hds?.note === 'string' ? hds.note : null,
      direction: from ? 'received' : 'sent',
      from,
      status: ack ? 'fulfilled' : 'pending',
      fulfilledAt: ack ? ack.time : null,
      ackEventId: ack ? ack.id : null
    });
  }
  out.sort((a, b) => b.requestedAt - a.requestedAt);
  return out;
}

const TEXT: Record<string, { title: string; body: string; due: string }> = {
  en: { title: 'Data export request', body: 'Please provide an export of the data you hold about me.', due: 'Requested by:' },
  fr: { title: 'Demande d’export de données', body: 'Merci de me fournir un export des données que vous détenez à mon sujet.', due: 'Souhaité avant le :' },
  es: { title: 'Solicitud de exportación de datos', body: 'Por favor, facilíteme una exportación de los datos que tiene sobre mí.', due: 'Antes del:' }
};

function randomId (): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
