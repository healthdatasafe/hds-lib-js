/**
 * Eligibility test of a study (data-model documentation/ELIGIBILITY.md).
 *
 * A request lists criteria. Each has a weight set by the requester, a declarative rule over data-model items, and
 * optionally a question used only when the account holds nothing the rule can be applied to. Everything runs on the
 * person's device: only the band of the score (below 50, or 50 and more) may be written, when she chooses to send it.
 */
import type { pryv } from '../patchedPryv.ts';
import type { HDSModel } from '../HDSModel/HDSModel.ts';
import type { HDSItemDef } from '../HDSModel/HDSItemDef.ts';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { isExactLabValue } from '../HDSModel/labResults.ts';
import { pryvErrorCode } from '../cmc/appScope.ts';
import { HDSLibError } from '../errors.ts';

export const ELIGIBILITY_BAND_TYPE = 'research/eligibility-band-v1';
export const ELIGIBILITY_BANDS = ['0-49', '50-100'] as const;
export const ELIGIBILITY_MIN_CRITERIA = 3;
export const ELIGIBILITY_MAX_CRITERIA = 16;
/** Languages every text of a request must have. */
export const ELIGIBILITY_LANGUAGES = ['en', 'fr'] as const;

export type EligibilityBand = typeof ELIGIBILITY_BANDS[number];
export type EligibilityText = { en: string; fr: string } & Record<string, string>;

export type EligibilityRule =
  | { op: 'exists'; itemKey: string; withinDays?: number }
  | { op: 'range'; itemKey: string; eventType: string; min?: number; max?: number; withinDays?: number }
  | { op: 'count'; itemKey: string; min: number; withinDays?: number }
  | { op: 'in'; itemKey: string; values: (string | number)[]; withinDays?: number }
  | { op: 'age'; itemKey: string; min?: number; max?: number };

export type EligibilityAnswerDef =
  | { type: 'boolean'; met: boolean }
  | { type: 'number'; unit?: EligibilityText; min?: number; max?: number }
  | { type: 'choice'; options: { value: string; label: EligibilityText }[]; met: string[] }
  | { type: 'date'; withinDays?: number; minYears?: number; maxYears?: number };

export interface EligibilityQuestion { text: EligibilityText; answer: EligibilityAnswerDef }

export interface EligibilityCriterion {
  id: string;
  label: EligibilityText;
  /** Set by the requester: an integer from 1 to 100. */
  weight: number;
  rule?: EligibilityRule;
  question?: EligibilityQuestion;
}

export interface EligibilityRequest {
  version: 1;
  requestId: string;
  studyId: string;
  studyName: EligibilityText;
  title: EligibilityText;
  description: EligibilityText;
  ethicsRef: string;
  /** Unix seconds. */
  expiresAt: number;
  criteria: EligibilityCriterion[];
}

export interface EligibilityIssue { path: string; code: string }

/** `boolean`, finite number, choice value, or date as `YYYY-MM-DD`; absent, null or undefined when skipped. */
export type EligibilityAnswers = Record<string, boolean | number | string | null | undefined>;

export type EligibilityOutcome = 'met' | 'not-met' | 'no-data';

export interface EligibilityCriterionResult {
  id: string;
  outcome: EligibilityOutcome;
  /** Where the outcome comes from: the account, an answer, or neither. */
  from: 'account' | 'answer' | null;
  /** Share of this criterion in the score, whole %. */
  share: number;
}

export interface EligibilityResult {
  criteria: EligibilityCriterionResult[];
  /** Whole %, rounded down as the band is, for the person's screen only: never written, never sent. */
  score: number;
  /** The only part that may be sent. Taken from the unrounded score. */
  band: EligibilityBand;
}

/** Outcome of each rule on the account's data, by criterion id. */
export type EligibilityOutcomes = Record<string, EligibilityOutcome>;

const DAY = 86400;
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const RESERVED_IDS = ['__proto__'];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PAGE = 200;

// ---------------------------------------------------------------- score

export function eligibilityBandOf (metWeight: number, totalWeight: number): EligibilityBand {
  return 2 * metWeight < totalWeight ? '0-49' : '50-100';
}

/**
 * Indexes of the criteria a band would reveal: whoever knows the weights reads their result in the band. With two
 * bands these are exactly the criteria that weigh half or more of the total.
 */
export function revealedCriteria (weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.flatMap((w, i) => 2 * w >= total ? [i] : []);
}

// ---------------------------------------------------------------- publish check

/**
 * Every reason to refuse a request; empty when it may be used. Run before a test, and at publish with `publish: true`,
 * which also refuses deprecated items (a live request survives the deprecation of one).
 */
export function checkEligibilityRequest (request: any, opts: { model?: HDSModel; now?: number; publish?: boolean } = {}): EligibilityIssue[] {
  const issues: EligibilityIssue[] = [];
  const add = (path: string, code: string) => { issues.push({ path, code }); };
  if (!isObject(request)) return [{ path: '', code: 'not-an-object' }];
  const model = opts.model ?? getModel();
  const now = opts.now ?? Date.now() / 1000;
  onlyKeys(request, ['version', 'requestId', 'studyId', 'studyName', 'title', 'description', 'ethicsRef', 'expiresAt', 'criteria'], '', add);
  if (request.version !== 1) add('version', 'unknown-version');
  for (const k of ['requestId', 'studyId']) if (typeof request[k] !== 'string' || !ID_RE.test(request[k])) add(k, 'invalid-id');
  for (const k of ['studyName', 'title', 'description']) checkText(request[k], k, add);
  if (typeof request.ethicsRef !== 'string' || request.ethicsRef.trim() === '') add('ethicsRef', 'missing');
  if (!isNumber(request.expiresAt)) add('expiresAt', 'invalid-date');
  else if (request.expiresAt <= now) add('expiresAt', 'expired');
  const criteria = request.criteria;
  if (!Array.isArray(criteria)) { add('criteria', 'missing'); return issues; }
  if (criteria.length < ELIGIBILITY_MIN_CRITERIA) add('criteria', 'too-few-criteria');
  if (criteria.length > ELIGIBILITY_MAX_CRITERIA) add('criteria', 'too-many-criteria');
  const ids = new Set<string>();
  criteria.forEach((c: any, i: number) => {
    const path = `criteria[${i}]`;
    if (!isObject(c)) { add(path, 'not-an-object'); return; }
    onlyKeys(c, ['id', 'label', 'weight', 'rule', 'question'], path, add);
    if (typeof c.id !== 'string' || !ID_RE.test(c.id) || RESERVED_IDS.includes(c.id)) add(path + '.id', 'invalid-id');
    else if (ids.has(c.id)) add(path + '.id', 'duplicate-id');
    ids.add(c.id);
    checkText(c.label, path + '.label', add);
    if (!isWeight(c.weight)) add(path + '.weight', 'invalid-weight');
    if (c.rule === undefined && c.question === undefined) add(path, 'no-rule-and-no-question');
    if (c.rule !== undefined) checkRule(c.rule, path + '.rule', model, opts.publish === true, add);
    if (c.question !== undefined) checkQuestion(c.question, path + '.question', add);
  });
  const weights = criteria.map((c: any) => c?.weight);
  if (weights.every(isWeight)) for (const i of revealedCriteria(weights)) add(`criteria[${i}].weight`, 'weight-half-or-more');
  return issues;
}

function checkRule (rule: any, path: string, model: HDSModel, publish: boolean, add: (path: string, code: string) => void): void {
  if (!isObject(rule)) { add(path, 'not-an-object'); return; }
  const keys: Record<string, string[]> = {
    exists: ['withinDays'],
    range: ['eventType', 'min', 'max', 'withinDays'],
    count: ['min', 'withinDays'],
    in: ['values', 'withinDays'],
    age: ['min', 'max']
  };
  if (typeof rule.op !== 'string' || !Object.hasOwn(keys, rule.op)) { add(path + '.op', 'unknown-operator'); return; }
  onlyKeys(rule, ['op', 'itemKey', ...keys[rule.op]], path, add);
  if (rule.withinDays !== undefined && !isPositiveInteger(rule.withinDays)) add(path + '.withinDays', 'invalid-number');
  const item = typeof rule.itemKey === 'string' ? model.itemsDefs.forKey(rule.itemKey, false) : null;
  if (item == null) { add(path + '.itemKey', 'unknown-item'); return; }
  if (publish && item.isDeprecated) add(path + '.itemKey', 'deprecated-item');
  // what a person does not enter or import as health data, and roots covered by name only (genetics, ...)
  if (item.isSystem || item.isAttachments || model.streams.isExplicitGrantOnly(item.data.streamId)) add(path + '.itemKey', 'item-not-allowed');
  if (rule.op === 'range') {
    if (!item.eventTypes.includes(rule.eventType)) add(path + '.eventType', 'not-a-type-of-the-item');
    else if (contentType(model, rule.eventType) !== 'number') add(path + '.eventType', 'not-a-number');
    checkBounds(rule.min, rule.max, path, add);
  }
  if (rule.op === 'count' && !isPositiveInteger(rule.min)) add(path + '.min', 'invalid-number');
  if (rule.op === 'in') {
    const options = optionsOf(item, model);
    if (options == null) add(path + '.itemKey', 'not-a-select-item');
    // an empty list, or every option, tests nothing
    else if (!Array.isArray(rule.values) || rule.values.length === 0 || new Set(rule.values).size !== rule.values.length ||
      rule.values.length >= options.length || rule.values.some((v: any) => !options.includes(v))) add(path + '.values', 'invalid-options');
  }
  if (rule.op === 'age') {
    if (item.eventTypes.length !== 1 || item.eventTypes[0] !== 'date/iso-8601') add(path + '.itemKey', 'not-a-date-item');
    checkBounds(rule.min, rule.max, path, add);
  }
}

function checkQuestion (q: any, path: string, add: (path: string, code: string) => void): void {
  if (!isObject(q)) { add(path, 'not-an-object'); return; }
  onlyKeys(q, ['text', 'answer'], path, add);
  checkText(q.text, path + '.text', add);
  const a = q.answer;
  path += '.answer';
  if (!isObject(a)) { add(path, 'not-an-object'); return; }
  const keys: Record<string, string[]> = {
    boolean: ['met'], number: ['unit', 'min', 'max'], choice: ['options', 'met'], date: ['withinDays', 'minYears', 'maxYears']
  };
  if (typeof a.type !== 'string' || !Object.hasOwn(keys, a.type)) { add(path + '.type', 'unknown-answer-type'); return; }
  onlyKeys(a, ['type', ...keys[a.type]], path, add);
  if (a.type === 'boolean' && typeof a.met !== 'boolean') add(path + '.met', 'not-a-boolean');
  if (a.type === 'number') {
    if (a.unit !== undefined) checkText(a.unit, path + '.unit', add);
    checkBounds(a.min, a.max, path, add);
  }
  if (a.type === 'choice') {
    const options = Array.isArray(a.options) ? a.options : [];
    const values = options.map((o: any) => o?.value);
    if (values.length < 2 || values.some((v: any) => typeof v !== 'string' || v === '') || new Set(values).size !== values.length) add(path + '.options', 'invalid-options');
    options.forEach((o: any, i: number) => {
      if (isObject(o)) onlyKeys(o, ['value', 'label'], `${path}.options[${i}]`, add);
      checkText(o?.label, `${path}.options[${i}].label`, add);
    });
    // an answer that always, or never, meets the criterion tells nothing
    if (!Array.isArray(a.met) || a.met.length === 0 || new Set(a.met).size !== a.met.length ||
      a.met.length >= values.length || a.met.some((v: any) => !values.includes(v))) add(path + '.met', 'invalid-options');
  }
  if (a.type === 'date') {
    if (a.withinDays !== undefined) {
      if (!isPositiveInteger(a.withinDays)) add(path + '.withinDays', 'invalid-number');
      if (a.minYears !== undefined || a.maxYears !== undefined) add(path, 'invalid-range');
    } else checkBounds(a.minYears, a.maxYears, path, add);
  }
}

function checkText (text: any, path: string, add: (path: string, code: string) => void): void {
  if (isObject(text) && Object.values(text).some((v) => typeof v !== 'string')) add(path, 'text-not-a-string');
  for (const lang of ELIGIBILITY_LANGUAGES) {
    if (!isObject(text) || typeof text[lang] !== 'string' || text[lang].trim() === '') add(path, 'missing-text:' + lang);
  }
}

function checkBounds (min: any, max: any, path: string, add: (path: string, code: string) => void): void {
  if (min === undefined && max === undefined) { add(path, 'missing-range'); return; }
  if ((min !== undefined && !isNumber(min)) || (max !== undefined && !isNumber(max))) add(path, 'invalid-number');
  else if (min !== undefined && max !== undefined && min > max) add(path, 'invalid-range');
}

function onlyKeys (o: Record<string, unknown>, allowed: string[], path: string, add: (path: string, code: string) => void): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) add(path === '' ? k : path + '.' + k, 'unknown-field');
}

// ---------------------------------------------------------------- before the run: nothing is read

/** Keys of the items the test will look at, for the screen shown before anything is read. */
export function eligibilityItemKeys (request: EligibilityRequest): string[] {
  return [...new Set(request.criteria.flatMap((c) => c.rule == null ? [] : [c.rule.itemKey]))];
}

export function isEligibilityExpired (request: { expiresAt: number }, now: number = Date.now() / 1000): boolean {
  return request.expiresAt <= now;
}

// ---------------------------------------------------------------- run

/**
 * Reads the items the rules name, and only those, and gives the outcome of each rule. Read-only.
 * Throws when the request is expired or invalid, before any read.
 */
export async function readEligibilityOutcomes (connection: pryv.Connection, request: EligibilityRequest, opts: { model?: HDSModel; now?: number } = {}): Promise<EligibilityOutcomes> {
  const model = opts.model ?? getModel();
  const now = opts.now ?? Date.now() / 1000;
  const issues = checkEligibilityRequest(request, { model, now });
  if (issues.length > 0) throw new HDSLibError('Eligibility request refused: ' + issues.map((i) => `${i.path} ${i.code}`).join(', '));
  const outcomes: EligibilityOutcomes = {};
  for (const key of eligibilityItemKeys(request)) {
    const item = model.itemsDefs.forKey(key)!;
    const pending = new Map(request.criteria.filter((c) => c.rule?.itemKey === key).map((c) => [c.id, newRuleState(c.rule!)]));
    for (let skip = 0; pending.size > 0; skip += PAGE) {
      const page = await readPage(connection, item, skip);
      for (const event of page) {
        if (event.time > now || !isOfItem(event, item, model)) continue;
        for (const [id, state] of pending) {
          const outcome = state.take(event, now, model);
          if (outcome != null) { outcomes[id] = outcome; pending.delete(id); }
        }
      }
      if (page.length < PAGE) break;
    }
    for (const [id, state] of pending) outcomes[id] = state.end();
  }
  return outcomes;
}

/** The event is one of the item, or of the item that replaced it on the same stream and type (a renamed key). */
function isOfItem (event: any, item: HDSItemDef, model: HDSModel): boolean {
  const resolved = model.itemsDefs.forEvent(event, false);
  return resolved != null && (resolved.key === item.key ||
    (resolved.data.streamId === item.data.streamId && item.eventTypes.includes(event.type)));
}

async function readPage (connection: pryv.Connection, item: HDSItemDef, skip: number): Promise<any[]> {
  try {
    return await connection.apiOne('events.get', { streams: [item.data.streamId], types: item.eventTypes, limit: PAGE, skip }, 'events') as any[];
  } catch (e: any) {
    // the stream does not exist on this account: nothing was ever recorded
    if (pryvErrorCode(e) === 'unknown-referenced-resource') return [];
    throw e;
  }
}

/** Criteria whose question is to be asked: no data for the rule (or no rule), and a question. */
export function eligibilityQuestionsToAsk (request: EligibilityRequest, outcomes: EligibilityOutcomes): EligibilityCriterion[] {
  return request.criteria.filter((c) => c.question != null && outcomeIn(outcomes, c.id) === 'no-data');
}

/** The result, on the device. An answer counts only where the account has no data, and never overrules it. */
export function eligibilityResult (request: EligibilityRequest, outcomes: EligibilityOutcomes, answers: EligibilityAnswers = {}, now: number = Date.now() / 1000): EligibilityResult {
  const total = request.criteria.reduce((sum, c) => sum + c.weight, 0);
  let met = 0;
  const criteria = request.criteria.map((c): EligibilityCriterionResult => {
    let outcome = outcomeIn(outcomes, c.id);
    let from: EligibilityCriterionResult['from'] = outcome === 'no-data' ? null : 'account';
    if (outcome === 'no-data' && c.question != null) {
      outcome = answerOutcome(c.question.answer, Object.hasOwn(answers, c.id) ? answers[c.id] : null, now);
      if (outcome !== 'no-data') from = 'answer';
    }
    if (outcome === 'met') met += c.weight;
    return { id: c.id, outcome, from, share: Math.round(100 * c.weight / total) };
  });
  return { criteria, score: Math.floor(100 * met / total), band: eligibilityBandOf(met, total) };
}

// ---------------------------------------------------------------- send, when the person chooses to

/** Everything that may be written: the request and the band. */
export function eligibilityBandContent (requestId: string, band: EligibilityBand): { requestId: string; band: EligibilityBand } {
  if (!ELIGIBILITY_BANDS.includes(band)) throw new HDSLibError(`Unknown eligibility band "${band}"`);
  return { requestId, band };
}

/** Writes the band on `streamId`: one event per request, replaced when she sends again. Returns its id. */
export async function sendEligibilityBand (connection: pryv.Connection, streamId: string, request: EligibilityRequest, band: EligibilityBand, now: number = Date.now() / 1000): Promise<string> {
  if (isEligibilityExpired(request, now)) throw new HDSLibError('Eligibility request expired');
  const content = eligibilityBandContent(request.requestId, band);
  for (let skip = 0; ; skip += PAGE) {
    const page = await connection.apiOne('events.get', { streams: [streamId], types: [ELIGIBILITY_BAND_TYPE], limit: PAGE, skip }, 'events') as any[];
    const previous = page.find((e) => e.content?.requestId === request.requestId);
    if (previous != null) {
      const updated = await connection.apiOne('events.update', { id: previous.id, update: { content, time: now } }, 'event') as any;
      return updated.id;
    }
    if (page.length < PAGE) break;
  }
  const created = await connection.apiOne('events.create', { streamIds: [streamId], type: ELIGIBILITY_BAND_TYPE, content, time: now }, 'event') as any;
  return created.id;
}

// ---------------------------------------------------------------- rules

interface RuleState {
  /** Takes the events of the item, latest start first. Returns the outcome as soon as it is known. */
  take (event: any, now: number, model: HDSModel): EligibilityOutcome | null;
  /** The outcome when there are no more events. */
  end (): EligibilityOutcome;
}

function newRuleState (rule: EligibilityRule): RuleState {
  if (rule.op === 'exists' || rule.op === 'count') {
    const min = rule.op === 'count' ? rule.min : 1;
    let inside = 0;
    let maybe = 0;
    let any = false;
    return {
      take (event, now) {
        any = true;
        const w = inWindow(event, rule.withinDays, now);
        if (w === 'in') inside++;
        else if (w === 'maybe') maybe++;
        return inside >= min ? 'met' : null;
      },
      end: () => !any || inside + maybe >= min ? 'no-data' : 'not-met'
    };
  }
  return {
    take (event, now, model) {
      if (rule.op === 'age') return ageOutcome(event, rule, now);
      const w = inWindow(event, rule.withinDays, now);
      if (w === 'maybe') return 'no-data';
      if (rule.op === 'in') {
        if (w === 'out') return 'not-met';
        const options = optionsOf(model.itemsDefs.forKey(rule.itemKey)!, model);
        return options?.includes(event.content) ? toOutcome(rule.values.includes(event.content)) : 'no-data';
      }
      const value = valueIn(event, rule.eventType, model, model.itemsDefs.forKey(rule.itemKey)!);
      if (value == null) return 'no-data';
      return toOutcome(w === 'in' && inRange(value, rule.min, rule.max));
    },
    end: () => 'no-data'
  };
}

function ageOutcome (event: any, rule: { min?: number; max?: number }, now: number): EligibilityOutcome {
  const years = typeof event.content === 'string' ? yearsSince(event.content.slice(0, 10), now) : null;
  return years == null ? 'no-data' : toOutcome(inRange(years, rule.min, rule.max));
}

/** `maybe`: the date is not known well enough to say (PARTIAL-DATES.md). A span counts up to its end. */
function inWindow (event: any, withinDays: number | undefined, now: number): 'in' | 'out' | 'maybe' {
  if (withinDays == null) return 'in';
  const since = now - withinDays * DAY;
  const precision = event.clientData?.hdsTimePrecision;
  const endPrecision = event.clientData?.hdsEndPrecision ?? (event.duration > 0 ? undefined : precision);
  if (event.duration === null) return 'in';
  const end = event.time + (event.duration ?? 0);
  if (precision === 'unknown' || endPrecision === 'unknown' || endPrecision === 'approx') return 'maybe';
  if (end >= since) return 'in';
  const d = new Date(end * 1000);
  let last = end;
  if (event.duration > 0) return 'out'; // a partial end is stored at the end of its period
  if (endPrecision === 'month') last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  if (endPrecision === 'year') last = Date.UTC(d.getUTCFullYear() + 1, 0, 1) / 1000;
  return last >= since ? 'maybe' : 'out';
}

/** The event's number in `eventType`, or null when it is not an exact number or cannot be converted. */
function valueIn (event: any, eventType: string, model: HDSModel, item: HDSItemDef): number | null {
  if (!isNumber(event.content) || !isExactLabValue(event)) return null;
  if (event.type === eventType) return event.content;
  // lab units: the item's own factors (data-model BLOOD-CHEMISTRY.md); a pair without one is never compared
  for (const f of item.data.unitConversions?.factors ?? []) {
    if (f.from === event.type && f.to === eventType) return event.content * f.factor;
    if (f.to === event.type && f.from === eventType) return event.content / f.factor;
  }
  for (const system of ['metric', 'imperial'] as const) {
    const converted = model.conversions.convert(event.type, event.content, system);
    if (converted?.targetEventType === eventType) return converted.value;
  }
  return null;
}

function answerOutcome (def: EligibilityAnswerDef, answer: unknown, now: number): EligibilityOutcome {
  if (answer == null) return 'no-data';
  switch (def.type) {
    case 'boolean':
      return typeof answer === 'boolean' ? toOutcome(answer === def.met) : 'no-data';
    case 'number':
      return isNumber(answer) ? toOutcome(inRange(answer, def.min, def.max)) : 'no-data';
    case 'choice':
      return def.options.some((o) => o.value === answer) ? toOutcome(def.met.includes(answer as string)) : 'no-data';
    case 'date': {
      const days = typeof answer === 'string' ? daysSince(answer, now) : null;
      if (days == null) return 'no-data';
      if (def.withinDays != null) return toOutcome(days <= def.withinDays);
      return toOutcome(inRange(yearsSince(answer as string, now)!, def.minYears, def.maxYears));
    }
  }
}

// ---------------------------------------------------------------- helpers

/** JSON type of an eventType's content: `number`, `boolean`, `null`, ... */
function contentType (model: HDSModel, eventType: string): string | null {
  const type = model.eventTypes.getEventTypeDefinition(eventType)?.type;
  return typeof type === 'string' ? type : null;
}

/** The option values of a `select` item whose content is one of them; null for any other item. */
function optionsOf (item: HDSItemDef, model: HDSModel): (string | number)[] | null {
  if (item.data.type !== 'select' || item.eventTypes.length !== 1 || !Array.isArray(item.data.options)) return null;
  if (!['string', 'number'].includes(contentType(model, item.eventTypes[0]) ?? '')) return null;
  return item.data.options.map((o: any) => o.value);
}

function parseDate (date: string): Date | null {
  const m = DATE_RE.exec(date);
  if (m == null) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

/** Whole days since a date, today included as 0; null for an invalid or future date. */
function daysSince (date: string, now: number): number | null {
  const d = parseDate(date);
  if (d == null) return null;
  const t = new Date(now * 1000);
  const days = Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - d.getTime()) / 1000 / DAY);
  return days < 0 ? null : days;
}

function yearsSince (date: string, now: number): number | null {
  if (daysSince(date, now) == null) return null;
  const d = parseDate(date)!;
  const t = new Date(now * 1000);
  const before = t.getMonth() < d.getUTCMonth() || (t.getMonth() === d.getUTCMonth() && t.getDate() < d.getUTCDate());
  return t.getFullYear() - d.getUTCFullYear() - (before ? 1 : 0);
}

function inRange (v: number, min?: number, max?: number): boolean {
  return (min == null || v >= min) && (max == null || v <= max);
}

function outcomeIn (outcomes: EligibilityOutcomes, id: string): EligibilityOutcome { return Object.hasOwn(outcomes, id) ? outcomes[id] : 'no-data'; }
function toOutcome (met: boolean): EligibilityOutcome { return met ? 'met' : 'not-met'; }
function isObject (v: unknown): v is Record<string, any> { return v != null && typeof v === 'object' && !Array.isArray(v); }
function isNumber (v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
function isPositiveInteger (v: unknown): v is number { return Number.isInteger(v) && (v as number) > 0; }
function isWeight (v: unknown): v is number { return isPositiveInteger(v) && v <= 100; }
