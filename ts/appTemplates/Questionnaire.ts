import { HDSLibError } from '../errors.ts';
import { validateLocalizableText } from '../localizeText.ts';
import type { localizableText } from '../localizeText.ts';
import type {
  QuestionDef,
  QuestionScope,
  QuestionSubField,
  AnswerEntry,
  QuestionnaireRequestContent,
  QuestionnaireAnswerContent
} from './interfaces.ts';

/**
 * Plan 71 — questionnaire template.
 *
 * A `Questionnaire` is the doctor-side reusable template for a set of questions
 * with temporal scope. It serializes into the `questionnaire/request-v1` event
 * content shape that the form-renderer (hds-forms-js) instantiates per patient.
 *
 * Sibling to `CollectorRequest`: a Questionnaire is reusable across multiple
 * requests; the request event written into a patient's stream is the
 * per-patient instantiation produced by `toRequestEventContent()`.
 *
 * See `data-model/documentation/QUESTIONNAIRE.md` for the storage shape and
 * the `clientData.related.<eventId>: true` cross-reference convention answer
 * writers must mirror.
 */

/** Pryv content-query path grammar — question keys must match for queryability. */
const QUESTION_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

const SUB_FIELD_TYPES = ['select-segmented', 'text', 'number'] as const;
const ANSWER_STATUSES = ['answered', 'no', 'unknown', 'declined'] as const;

export class Questionnaire {
  #title: localizableText | null;
  #description: localizableText | null;
  #templateRef: string | null;
  #questions: Map<string, QuestionDef>;

  constructor (content?: Partial<QuestionnaireRequestContent>) {
    this.#title = null;
    this.#description = null;
    this.#templateRef = null;
    this.#questions = new Map();
    if (content != null) this.setContent(content);
  }

  setContent (content: Partial<QuestionnaireRequestContent>) {
    const futureContent = structuredClone(content) as Partial<QuestionnaireRequestContent>;
    if (futureContent.title != null) {
      validateLocalizableText('title', futureContent.title);
      this.#title = futureContent.title;
    }
    if (futureContent.description != null) {
      validateLocalizableText('description', futureContent.description);
      this.#description = futureContent.description;
    }
    if (futureContent.templateRef != null) {
      if (typeof futureContent.templateRef !== 'string') {
        throw new HDSLibError('Questionnaire.templateRef must be a string');
      }
      this.#templateRef = futureContent.templateRef;
    }
    if (futureContent.questions != null) {
      this.#questions = new Map();
      for (const [key, def] of Object.entries(futureContent.questions)) {
        this.addQuestion(key, def);
      }
    }
  }

  // ---------- title / description / templateRef ---------- //

  get title (): localizableText | null { return this.#title; }
  set title (value: localizableText) {
    validateLocalizableText('title', value);
    this.#title = value;
  }

  get description (): localizableText | null { return this.#description; }
  set description (value: localizableText) {
    validateLocalizableText('description', value);
    this.#description = value;
  }

  get templateRef (): string | null { return this.#templateRef; }
  set templateRef (value: string) {
    if (typeof value !== 'string') throw new HDSLibError('templateRef must be a string');
    this.#templateRef = value;
  }

  // ---------- questions ---------- //

  /**
   * Add a question. Throws if the key violates the Pryv path grammar or the
   * definition fails shape validation (scope/subField checks).
   */
  addQuestion (key: string, def: QuestionDef): QuestionDef {
    Questionnaire.#validateQuestionKey(key);
    if (this.#questions.has(key)) {
      throw new HDSLibError(`Questionnaire already has a question with key '${key}'`);
    }
    Questionnaire.#validateQuestionDef(key, def);
    this.#questions.set(key, def);
    return def;
  }

  /** Remove a question by key. Returns true if it existed. */
  removeQuestion (key: string): boolean {
    return this.#questions.delete(key);
  }

  getQuestion (key: string): QuestionDef | null {
    return this.#questions.get(key) ?? null;
  }

  get questionKeys (): string[] {
    return [...this.#questions.keys()];
  }

  get questions (): Record<string, QuestionDef> {
    return Object.fromEntries(this.#questions);
  }

  // ---------- serialization ---------- //

  /**
   * Serialize as the content shape of a `questionnaire/request-v1` event. The
   * caller writes it as `event.content`; `streamIds` and `time` are the
   * caller's concern.
   */
  toRequestEventContent (): QuestionnaireRequestContent {
    if (this.#questions.size === 0) {
      throw new HDSLibError('Questionnaire requires at least one question');
    }
    const out: QuestionnaireRequestContent = {
      questions: structuredClone(this.questions)
    };
    if (this.#title != null) out.title = structuredClone(this.#title);
    if (this.#description != null) out.description = structuredClone(this.#description);
    if (this.#templateRef != null) out.templateRef = this.#templateRef;
    return out;
  }

  /**
   * Load a Questionnaire from a `questionnaire/request-v1` event (the patient's
   * renderer needs this to know how to render the form).
   */
  static fromRequestEvent (event: { content?: unknown }): Questionnaire {
    if (event?.content == null || typeof event.content !== 'object') {
      throw new HDSLibError('Cannot load Questionnaire: event has no content');
    }
    return new Questionnaire(event.content as Partial<QuestionnaireRequestContent>);
  }

  /**
   * Build a ready-to-write `questionnaire/request-v1` event payload.
   * Convenience for the doctor-side flow that materializes bundled
   * questionnaires (`CollectorRequest.questionnaires`) into events after the
   * patient accepts and the data-grant access is in hand. The consumer
   * batches the returned payloads via `connection.api()`.
   */
  static makeRequestEvent (
    content: QuestionnaireRequestContent,
    streamIds: string[],
    timeSeconds?: number
  ): { type: 'questionnaire/request-v1', streamIds: string[], time: number, content: QuestionnaireRequestContent } {
    if (!Array.isArray(streamIds) || streamIds.length === 0) {
      throw new HDSLibError('makeRequestEvent: streamIds must be a non-empty array');
    }
    // Roundtrip through a Questionnaire instance to validate the shape — the
    // caller may pass content from anywhere (a CollectorRequest's bundled
    // entry, a saved template, or a fresh build).
    const roundTripped = new Questionnaire(content).toRequestEventContent();
    return {
      type: 'questionnaire/request-v1',
      streamIds,
      time: timeSeconds ?? Math.floor(Date.now() / 1000),
      content: roundTripped
    };
  }

  /**
   * Materialize a CollectorRequest's bundled questionnaires into
   * `questionnaire/request-v1` events on the given Pryv connection. The
   * patient-side accept flow calls this AFTER `cmc.acceptInvite` succeeds,
   * so the request events land in the patient's own stream and the
   * questionnaires become "pending" for the patient app to render and fill.
   *
   * Returns the Pryv batch result array (one entry per event) — entries with
   * `error` need caller-side handling; entries with `event` are successful
   * writes. If the request carries no bundled questionnaires, returns []
   * without making an API call.
   *
   * Atomicity: Pryv `events.batch` is best-effort per-entry — a single failed
   * write doesn't roll back the others. Callers needing transactional
   * guarantees must inspect the result and reconcile.
   */
  static async writeBundled (
    connection: { api: (calls: Array<{ method: string, params: unknown }>) => Promise<unknown[]> },
    request: { questionnaires: QuestionnaireRequestContent[] },
    streamIds: string[],
    options?: { timeSeconds?: number }
  ): Promise<unknown[]> {
    if (!Array.isArray(streamIds) || streamIds.length === 0) {
      throw new HDSLibError('writeBundled: streamIds must be a non-empty array');
    }
    const list = request?.questionnaires ?? [];
    if (list.length === 0) return [];
    const time = options?.timeSeconds ?? Math.floor(Date.now() / 1000);
    const calls = list.map((content) => ({
      method: 'events.create',
      params: Questionnaire.makeRequestEvent(content, streamIds, time)
    }));
    return await connection.api(calls);
  }

  // ---------- answer-side helper ---------- //

  /**
   * Build a valid `questionnaire/answer-v1` event payload (content + clientData)
   * from a map of question-key → AnswerEntry, against the request event the
   * patient is responding to.
   *
   * Returns:
   *   - `content`: the answer-event content payload.
   *   - `clientData`: the `{ related: { <eventId>: true, ... } }` keyed-object
   *     cross-reference mirror per the Pryv §7 convention.
   *
   * Throws if any answer references an unknown question key, if an `answered`
   * entry has empty references, or if a status is unknown.
   */
  static buildAnswerEvent (
    requestEventId: string,
    answers: Record<string, AnswerEntry>,
    knownQuestionKeys?: string[]
  ): {
      content: QuestionnaireAnswerContent,
      clientData: { related: Record<string, true> }
    } {
    if (typeof requestEventId !== 'string' || requestEventId.length === 0) {
      throw new HDSLibError('buildAnswerEvent: requestEventId must be a non-empty string');
    }
    const validKeys = knownQuestionKeys ? new Set(knownQuestionKeys) : null;
    const related: Record<string, true> = { [requestEventId]: true };
    const outAnswers: Record<string, AnswerEntry> = {};
    for (const [key, entry] of Object.entries(answers)) {
      Questionnaire.#validateQuestionKey(key);
      if (validKeys && !validKeys.has(key)) {
        throw new HDSLibError(`buildAnswerEvent: answer key '${key}' is not a question on the request`);
      }
      Questionnaire.#validateAnswerEntry(key, entry);
      outAnswers[key] = structuredClone(entry);
      if (entry.status === 'answered') {
        for (const refId of entry.references) {
          related[refId] = true;
        }
      }
    }
    return {
      content: { requestEventId, answers: outAnswers },
      clientData: { related }
    };
  }

  // ---------- validation ---------- //

  static #validateQuestionKey (key: string) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new HDSLibError('Question key must be a non-empty string');
    }
    if (!QUESTION_KEY_PATTERN.test(key)) {
      throw new HDSLibError(`Question key '${key}' does not match the Pryv path grammar [a-zA-Z0-9_-]+ (no colons, dots, brackets, or wildcards)`);
    }
  }

  static #validateQuestionDef (key: string, def: QuestionDef) {
    if (def == null || typeof def !== 'object') {
      throw new HDSLibError(`Question '${key}' definition must be an object`);
    }
    if (def.label == null) {
      throw new HDSLibError(`Question '${key}' is missing 'label'`);
    }
    validateLocalizableText(`questions[${key}].label`, def.label);
    if (typeof def.itemRef !== 'string' || def.itemRef.length === 0) {
      throw new HDSLibError(`Question '${key}' is missing 'itemRef' (must be a non-empty string)`);
    }
    Questionnaire.#validateScope(key, def.scope);
    if (def.subField != null) Questionnaire.#validateSubField(key, def.subField);
    if (def.params != null && typeof def.params !== 'object') {
      throw new HDSLibError(`Question '${key}'.params must be an object`);
    }
  }

  static #validateScope (key: string, scope: QuestionScope) {
    if (scope == null || typeof scope !== 'object') {
      throw new HDSLibError(`Question '${key}' is missing 'scope'`);
    }
    if (scope.type === 'ever') {
      if (Object.keys(scope).length !== 1) {
        throw new HDSLibError(`Question '${key}'.scope: 'ever' must not carry extra fields`);
      }
      return;
    }
    if (scope.type === 'window' || scope.type === 'latest') {
      if (typeof scope.withinDays !== 'number' || scope.withinDays <= 0) {
        throw new HDSLibError(`Question '${key}'.scope.${scope.type}: 'withinDays' must be a positive number`);
      }
      return;
    }
    throw new HDSLibError(`Question '${key}'.scope.type '${(scope as { type: string }).type}' is not recognized (valid: ever, window, latest)`);
  }

  static #validateSubField (key: string, subField: QuestionSubField) {
    if (subField == null || typeof subField !== 'object') {
      throw new HDSLibError(`Question '${key}'.subField must be an object`);
    }
    if (!SUB_FIELD_TYPES.includes(subField.type)) {
      throw new HDSLibError(`Question '${key}'.subField.type must be one of ${SUB_FIELD_TYPES.join(' / ')}`);
    }
    if (subField.label != null) validateLocalizableText(`questions[${key}].subField.label`, subField.label);
    if (subField.options != null) {
      if (!Array.isArray(subField.options)) {
        throw new HDSLibError(`Question '${key}'.subField.options must be an array`);
      }
      for (const [i, opt] of subField.options.entries()) {
        if (opt == null || typeof opt !== 'object') {
          throw new HDSLibError(`Question '${key}'.subField.options[${i}] must be an object`);
        }
        if (typeof opt.value !== 'string' && typeof opt.value !== 'number') {
          throw new HDSLibError(`Question '${key}'.subField.options[${i}].value must be a string or number`);
        }
        validateLocalizableText(`questions[${key}].subField.options[${i}].label`, opt.label);
      }
    }
  }

  static #validateAnswerEntry (key: string, entry: AnswerEntry) {
    if (entry == null || typeof entry !== 'object') {
      throw new HDSLibError(`Answer for question '${key}' must be an object`);
    }
    if (!ANSWER_STATUSES.includes((entry as AnswerEntry).status)) {
      throw new HDSLibError(`Answer for question '${key}': status must be one of ${ANSWER_STATUSES.join(' / ')}`);
    }
    if (entry.status === 'answered') {
      if (!Array.isArray(entry.references) || entry.references.length === 0) {
        throw new HDSLibError(`Answer for question '${key}': 'answered' status requires non-empty 'references' array`);
      }
      for (const [i, refId] of entry.references.entries()) {
        if (typeof refId !== 'string' || refId.length === 0) {
          throw new HDSLibError(`Answer for question '${key}'.references[${i}] must be a non-empty string`);
        }
      }
      return;
    }
    // For no / unknown / declined statuses: reject references presence
    if ((entry as { references?: unknown }).references != null) {
      throw new HDSLibError(`Answer for question '${key}': status '${entry.status}' must not carry 'references'`);
    }
    if (entry.status === 'declined' && entry.reason != null && typeof entry.reason !== 'string') {
      throw new HDSLibError(`Answer for question '${key}'.reason must be a string (v1 — coded values deferred)`);
    }
  }
}
