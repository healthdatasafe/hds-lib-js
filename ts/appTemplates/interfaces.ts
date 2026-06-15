import type { localizableText } from '../localizeText.ts';

export type RequestSectionType = 'recurring' | 'permanent';

export interface CollectorSectionInterface {
  key: string,
  type: RequestSectionType,
  name: localizableText,
  /**
   * @property {Array<string>} itemKeys - a list of known HDSItemDef key
   */
  itemKeys: Array<string>,
  itemCustomizations?: Record<string, Record<string, unknown>>
}

export interface Permission {
  streamId: string;
  defaultName?: string;
  level: string;
}

// ---- Plan 71 — questionnaire request/answer event pair ---- //

/** Temporal scope for a question. Evaluated by the renderer for prefill / matching event lookup. */
export type QuestionScope =
  | { type: 'ever' }
  | { type: 'window'; withinDays: number }
  | { type: 'latest'; withinDays: number };

/** Sub-field shape captured alongside an 'answered' status (stored as `qualifier` on the answer entry). */
export interface QuestionSubField {
  type: 'select-segmented' | 'text' | 'number';
  label?: localizableText;
  options?: Array<{ value: string | number, label: localizableText }>;
}

/** Per-question definition carried by `questionnaire/request-v1` content.questions[<key>]. */
export interface QuestionDef {
  label: localizableText;
  itemRef: string;
  params?: Record<string, unknown>;
  scope: QuestionScope;
  subField?: QuestionSubField;
}

/** Status enum for `questionnaire/answer-v1` per-question entries. Key absence = implicit 'not-answered'. */
export type AnswerStatus = 'answered' | 'no' | 'unknown' | 'declined';

/** Per-question answer entry shape (oneOf discriminator on `status` in the data-model schema). */
export type AnswerEntry =
  | { status: 'answered'; references: string[]; qualifier?: unknown }
  | { status: 'no' }
  | { status: 'unknown' }
  | { status: 'declined'; reason?: string };

/** Content shape of a `questionnaire/request-v1` event. */
export interface QuestionnaireRequestContent {
  title?: localizableText;
  description?: localizableText;
  templateRef?: string;
  questions: Record<string, QuestionDef>;
}

/** Content shape of a `questionnaire/answer-v1` event (does NOT include the clientData mirror). */
export interface QuestionnaireAnswerContent {
  requestEventId: string;
  answers: Record<string, AnswerEntry>;
}
