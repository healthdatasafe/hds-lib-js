/**
 * The HDS research relationship (data-model documentation/RESEARCH.md).
 *
 * A person who says yes to the research opt-in accepts the `hds-research` CMC invite, which needs a verified email.
 * It asks `read` on the person's email and `read` on
 * the `explicitGrantOnly` root `hds-research`, whose two children hold what HDS may read: the score ranges the person
 * chose to send (`hds-research-eligibility`, band events of `./eligibility.ts`) and the topics they chose
 * (`hds-research-topics`, one `research/topics-v1` event). HDS sends two `notification/alert-cmc` kinds, ids only.
 */
import type { pryv } from '../patchedPryv.ts';
import type { HDSModel } from '../HDSModel/HDSModel.ts';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { schemaIssues } from '../utils/schemaCheck.ts';
import { HDSLibError } from '../errors.ts';
import { ELIGIBILITY_BAND_TYPE } from './eligibility.ts';

export const RESEARCH_ROOT_STREAM_ID = 'hds-research';
export const RESEARCH_ELIGIBILITY_STREAM_ID = 'hds-research-eligibility';
export const RESEARCH_TOPICS_STREAM_ID = 'hds-research-topics';
export const RESEARCH_TOPICS_TYPE = 'research/topics-v1';
export const RESEARCH_TOPIC_VOCABULARY = 'research-topic';
export const RESEARCH_ALERT_KINDS = ['research-invitation', 'research-eligibility-request'] as const;

/** Names the streams are created with when the model is not loaded (the model's `name` wins). */
const STREAM_NAMES: Record<string, string> = {
  [RESEARCH_ROOT_STREAM_ID]: 'Health Data Safe research',
  [RESEARCH_ELIGIBILITY_STREAM_ID]: 'Eligibility test results sent',
  [RESEARCH_TOPICS_STREAM_ID]: 'Research topics'
};

export type ResearchAlertKind = typeof RESEARCH_ALERT_KINDS[number];
export type ResearchAlert = { kind: 'research-invitation'; studyId: string } | { kind: 'research-eligibility-request'; requestId: string };

const PAGE = 200;

// ---------------------------------------------------------------- the invite and the streams

/** The account email stream the research invite also reads (the invite requires it verified at accept). */
export const RESEARCH_EMAIL_STREAM_ID = ':system:email';

/**
 * The permissions the research invite requests: `read` on the root, which reaches its two children only, and `read`
 * on the person's email (`:system:email`), which the invite requires verified (`requireVerifiedEmail`).
 */
export function researchInvitePermissions (): Array<{ streamId: string; level: 'read' }> {
  return [{ streamId: RESEARCH_ROOT_STREAM_ID, level: 'read' }, { streamId: RESEARCH_EMAIL_STREAM_ID, level: 'read' }];
}

function modelStreamName (id: string, model: HDSModel | null): string {
  try {
    const name = model?.streams.getDataById(id, false)?.name;
    if (typeof name === 'string' && name) return name;
  } catch { /* model not loaded */ }
  return STREAM_NAMES[id];
}

/**
 * Creates the root and its two children on the person's account, before the invite is accepted (as for any offered
 * stream). Needs a personal or app access able to create them; `item-already-exists` is the normal outcome after the
 * first time.
 */
export async function ensureResearchStreams (connection: pryv.Connection, opts: { model?: HDSModel } = {}): Promise<void> {
  const model = opts.model ?? safeModel();
  const calls = [RESEARCH_ROOT_STREAM_ID, RESEARCH_ELIGIBILITY_STREAM_ID, RESEARCH_TOPICS_STREAM_ID].map((id) => ({
    method: 'streams.create',
    params: { id, name: modelStreamName(id, model), ...(id === RESEARCH_ROOT_STREAM_ID ? {} : { parentId: RESEARCH_ROOT_STREAM_ID }) }
  }));
  const results = await connection.api(calls as any) as any[];
  for (const r of results) {
    if (r?.error && r.error.id !== 'item-already-exists') {
      throw new HDSLibError('ensureResearchStreams: ' + (r.error.message || r.error.id), { reason: r.error.id });
    }
  }
}

function safeModel (): HDSModel | null {
  try { return getModel(); } catch { return null; }
}

// ---------------------------------------------------------------- topics

/** The topic keys the model knows (the `research-topic` vocabulary), in order. Throws when the model has none. */
export function researchTopicKeys (model: HDSModel = getModel()): string[] {
  const vocabulary = model.vocabularies.forKey(RESEARCH_TOPIC_VOCABULARY) as any;
  if (vocabulary?.values == null) throw new HDSLibError('The data model has no research-topic vocabulary', { reason: 'model-too-old' });
  return Object.keys(vocabulary.values);
}

/**
 * The topics the person chose: the latest `research/topics-v1` event by `modified`, keys the model does not know
 * dropped (a newer model). `null` when there is no event or no stream: none chosen, so every study may be offered.
 * A choice made only of keys this model does not know is returned as written, never as an empty list: an empty list
 * means "none chosen", which would offer every study to a person who narrowed them.
 */
export async function readResearchTopics (connection: pryv.Connection, opts: { model?: HDSModel; topicKeys?: string[] } = {}): Promise<string[] | null> {
  const latest = await latestTopicsEvent(connection);
  if (latest == null) return null;
  const known = new Set(opts.topicKeys ?? researchTopicKeys(opts.model));
  const written = (Array.isArray(latest.content?.topics) ? latest.content.topics : []).filter((t: unknown): t is string => typeof t === 'string');
  const kept = written.filter((t: string) => known.has(t));
  return kept.length > 0 || written.length === 0 ? kept : written;
}

/**
 * Saves the chosen topics: updates the latest event, or creates it. Each topic must be a key of the vocabulary;
 * duplicates are dropped and the vocabulary's order kept. An empty list is "none chosen". Returns the event id.
 */
export async function saveResearchTopics (connection: pryv.Connection, topics: string[], opts: { model?: HDSModel; topicKeys?: string[]; now?: number } = {}): Promise<string> {
  const keys = opts.topicKeys ?? researchTopicKeys(opts.model);
  const unknown = topics.filter((t) => !keys.includes(t));
  if (unknown.length > 0) throw new HDSLibError('Unknown research topic: ' + unknown.join(', '), { reason: 'unknown-topic', unknown });
  const content = { topics: keys.filter((k) => topics.includes(k)) };
  const time = opts.now ?? Date.now() / 1000;
  const latest = await latestTopicsEvent(connection);
  if (latest != null) {
    const updated = await connection.apiOne('events.update', { id: latest.id, update: { content, time } }, 'event') as any;
    return updated.id;
  }
  const created = await connection.apiOne('events.create', { streamIds: [RESEARCH_TOPICS_STREAM_ID], type: RESEARCH_TOPICS_TYPE, content, time }, 'event') as any;
  return created.id;
}

async function latestTopicsEvent (connection: pryv.Connection): Promise<any | null> {
  const events = await allEvents(connection, RESEARCH_TOPICS_STREAM_ID, RESEARCH_TOPICS_TYPE);
  let latest: any = null;
  for (const e of events) if (latest == null || (e.modified ?? e.time) > (latest.modified ?? latest.time)) latest = e;
  return latest;
}

// ---------------------------------------------------------------- bands: retention

/**
 * Deletes band events: those of the given request ids (expired requests), or all of them on opt-out. Trashes then
 * deletes, so nothing stays for HDS to re-read. Returns how many were removed.
 */
export async function deleteEligibilityBands (connection: pryv.Connection, opts: { requestIds?: string[] } = {}): Promise<number> {
  const events = await allEvents(connection, RESEARCH_ELIGIBILITY_STREAM_ID, ELIGIBILITY_BAND_TYPE);
  const targets = opts.requestIds == null ? events : events.filter((e) => opts.requestIds!.includes(e.content?.requestId));
  for (const e of targets) {
    const results = await connection.api([
      { method: 'events.delete', params: { id: e.id } },
      { method: 'events.delete', params: { id: e.id } }
    ] as any) as any[];
    const failed = results.find((r) => r?.error);
    if (failed) throw new HDSLibError('deleteEligibilityBands: ' + (failed.error.message || failed.error.id), { reason: failed.error.id });
  }
  return targets.length;
}

async function allEvents (connection: pryv.Connection, streamId: string, type: string): Promise<any[]> {
  const out: any[] = [];
  for (let skip = 0; ; skip += PAGE) {
    let page: any[];
    try {
      page = await connection.apiOne('events.get', { streams: [streamId], types: [type], limit: PAGE, skip }, 'events') as any[];
    } catch (err: any) {
      if (err?.innerObject?.id === 'unknown-referenced-resource') return out;
      throw err;
    }
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

// ---------------------------------------------------------------- alerts

const ID = { type: 'string', maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' };
function alertBranch (kind: string, required: string[], properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, required: ['kind', ...required], properties: { kind: { type: 'string', enum: [kind] }, ...properties } };
}

/**
 * `json-schemas/hds-research-alert.json` of data-model (descriptions left out). `tests/researchRelationship.test.js`
 * compares this copy with the published one once it is published.
 */
export const RESEARCH_ALERT_HDS_SCHEMA = {
  type: 'object',
  required: ['kind'],
  oneOf: [
    alertBranch('research-invitation', ['studyId'], { studyId: ID }),
    alertBranch('research-eligibility-request', ['requestId'], { requestId: ID })
  ]
};

/** The issues of a research alert's `hds` block against the published schema; empty when valid. */
export function checkResearchAlertHds (hds: unknown): string[] {
  return schemaIssues(RESEARCH_ALERT_HDS_SCHEMA, hds, 'hds');
}

const ALERT_TEXTS: Record<ResearchAlertKind, { title: Record<string, string>; body: Record<string, string> }> = {
  'research-invitation': {
    title: { en: 'Research invitation', fr: 'Invitation à la recherche' },
    body: { en: 'Health Data Safe invites you to a study. Open to read about it.', fr: 'Health Data Safe vous invite à une étude. Ouvrez pour en savoir plus.' }
  },
  'research-eligibility-request': {
    title: { en: 'Eligibility test', fr: 'Test d\'éligibilité' },
    body: { en: 'A study asks whether you may be eligible. Open to read the conditions.', fr: 'Une étude vous demande si vous pourriez être éligible. Ouvrez pour lire les conditions.' }
  }
};

/**
 * Alert content for one research kind (the research service writes it): the kind's fixed `title` and `body`,
 * `code: hds-<kind>`, `level: info`, and the checked `hds` block. Never a name, a date or a criterion.
 */
export function buildResearchAlertContent (hds: ResearchAlert): Record<string, unknown> {
  const issues = checkResearchAlertHds(hds);
  if (issues.length > 0) throw new HDSLibError('buildResearchAlertContent: invalid hds block: ' + issues.join('; '), { reason: 'invalid-alert', issues });
  const texts = ALERT_TEXTS[hds.kind];
  return { level: 'info', title: { ...texts.title }, body: { ...texts.body }, code: 'hds-' + hds.kind, hds: { ...hds } };
}

/**
 * Reads a delivered alert's content: the research kind and its id, or null when it is not a research alert, is not
 * valid, or carries no `from` (the writer's own copy; only delivered alerts are shown).
 */
export function readResearchAlert (content: unknown): ResearchAlert | null {
  const c = content as Record<string, any> | null;
  if (c == null || typeof c !== 'object' || c.from == null) return null;
  if (!RESEARCH_ALERT_KINDS.includes(c.hds?.kind)) return null;
  if (checkResearchAlertHds(c.hds).length > 0) return null;
  return c.hds.kind === 'research-invitation'
    ? { kind: 'research-invitation', studyId: c.hds.studyId }
    : { kind: 'research-eligibility-request', requestId: c.hds.requestId };
}

/** The key a reader de-duplicates research alerts by (two devices, a re-delivery): `(kind, id)`. */
export function researchAlertKey (alert: ResearchAlert): string {
  return alert.kind === 'research-invitation' ? `${alert.kind}:${alert.studyId}` : `${alert.kind}:${alert.requestId}`;
}
