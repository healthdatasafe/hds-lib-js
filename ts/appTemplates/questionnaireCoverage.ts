/**
 * Plan 71 — Questionnaire coverage check.
 *
 * A bundled Questionnaire is only useful if the surrounding CollectorRequest
 * grants permissions on every stream the questionnaire's referenced items live
 * on. When a doctor (or a generator) adds a Questionnaire to a request that
 * doesn't already cover its items, the bundled questionnaire's prefill /
 * answer-related-event flow can't reach the patient's existing typed events.
 *
 * This helper compares a Questionnaire against a CollectorRequest's
 * permissions, surfaces any gaps (per question), and proposes the additional
 * permissions needed. The companion convenience
 * `CollectorRequest#applyQuestionnaireCoverage` mutates the request in place.
 *
 * Scope: permissions only. Sections and customFields are doctor-curated UX
 * surfaces, not correctness constraints — a question's item does NOT need a
 * matching section entry; it only needs a permission so the answer event's
 * `references[]` can be resolved on the doctor's side.
 *
 * Unknown itemRefs (no matching item in the loaded HDS model) are surfaced as
 * `unknownItem: true` rows; the helper never throws on them. Callers should
 * decide whether to block submission or just warn the doctor.
 */

import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { Questionnaire } from './Questionnaire.ts';
import type { QuestionnaireRequestContent } from './interfaces.ts';

/** Per-question coverage row in the report. */
export interface QuestionCoverage {
  /** Question key (from the request). */
  questionKey: string;
  /** Item the question refers to. */
  itemRef: string;
  /** Stream the item lives on (null when the item is unknown to the model). */
  streamId: string | null;
  /**
   * The permission entry (from request.permissions) that covers this question's
   * stream — either an exact match or an ancestor stream. Null when no
   * permission grants access.
   */
  coveredBy: { streamId: string, level: string } | null;
  /** True when the item is in the model but the request doesn't cover its stream. */
  missing: boolean;
  /** True when the item key isn't present in the loaded HDS model. */
  unknownItem: boolean;
}

/** Full report returned by `checkQuestionnaireCoverage`. */
export interface QuestionnaireCoverageReport {
  /**
   * `true` when every question's item is covered (or unknown — unknown items
   * are surfaced but do not flip `ok` since they aren't actionable here).
   */
  ok: boolean;
  /** One entry per question, in the same order as the Questionnaire's questions. */
  perQuestion: QuestionCoverage[];
  /** Distinct itemRefs that the loaded model doesn't know about. */
  unknownItems: string[];
  /**
   * Minimal additional permissions the request should add to cover every
   * known-item question. Computed via the same `authorizations.forItemKeys`
   * path that `CollectorRequest#buildPermissions` uses, so the merged result
   * stays minimal (no parent/child duplication).
   */
  proposedPermissions: Array<{ streamId: string, defaultName: string, level: string }>;
}

/** Minimum surface the helper needs from the request side. */
export interface RequestCoverageLike {
  permissions: Array<{ streamId: string, defaultName?: string, level: string }>;
}

/** Normalize either a `Questionnaire` instance or a raw content payload to content. */
function asQuestionnaireContent (q: Questionnaire | QuestionnaireRequestContent): QuestionnaireRequestContent {
  if (q instanceof Questionnaire) return q.toRequestEventContent();
  return q;
}

/** Normalize either a `CollectorRequest` instance or any object exposing `permissions[]`. */
function asRequest (request: RequestCoverageLike | { content: { permissions?: any[] } }): RequestCoverageLike {
  // CollectorRequest exposes `.permissions` as a getter and `.content.permissions`; both work.
  const r = request as RequestCoverageLike;
  if (Array.isArray(r.permissions)) return r;
  const c = (request as { content?: { permissions?: any[] } }).content;
  if (c && Array.isArray(c.permissions)) return { permissions: c.permissions as any };
  return { permissions: [] };
}

/**
 * Compute the coverage report. Read-only — does not mutate either input.
 */
export function checkQuestionnaireCoverage (
  questionnaire: Questionnaire | QuestionnaireRequestContent,
  request: RequestCoverageLike | { content: { permissions?: any[] } }
): QuestionnaireCoverageReport {
  const content = asQuestionnaireContent(questionnaire);
  const req = asRequest(request);
  const model = getModel();

  const existingByStreamId: Record<string, { streamId: string, level: string }> = {};
  for (const p of req.permissions) {
    if (typeof p?.streamId === 'string') existingByStreamId[p.streamId] = { streamId: p.streamId, level: p.level };
  }

  function findCoveringPermission (streamId: string): { streamId: string, level: string } | null {
    if (existingByStreamId[streamId]) return existingByStreamId[streamId];
    // Walk ancestors via the model — a parent permission covers descendants.
    const ancestors = model.streams.getParentsIds(streamId, false);
    for (const parent of ancestors) {
      if (existingByStreamId[parent]) return existingByStreamId[parent];
    }
    return null;
  }

  const perQuestion: QuestionCoverage[] = [];
  const unknownItems: string[] = [];
  const missingItemKeysSet = new Set<string>();

  for (const [key, q] of Object.entries(content.questions ?? {})) {
    const itemRef = q.itemRef;
    const itemDef = model.itemsDefs.forKey(itemRef, false);
    if (itemDef == null) {
      if (!unknownItems.includes(itemRef)) unknownItems.push(itemRef);
      perQuestion.push({
        questionKey: key,
        itemRef,
        streamId: null,
        coveredBy: null,
        missing: false,
        unknownItem: true
      });
      continue;
    }
    const streamId = itemDef.data?.streamId ?? null;
    if (streamId == null) {
      // Item exists in the model but has no streamId — shouldn't happen for
      // real items, but be defensive: treat as a missing-but-unactionable row.
      perQuestion.push({
        questionKey: key,
        itemRef,
        streamId: null,
        coveredBy: null,
        missing: true,
        unknownItem: false
      });
      continue;
    }
    const coveredBy = findCoveringPermission(streamId);
    const missing = coveredBy == null;
    if (missing) missingItemKeysSet.add(itemRef);
    perQuestion.push({
      questionKey: key,
      itemRef,
      streamId,
      coveredBy,
      missing,
      unknownItem: false
    });
  }

  let proposedPermissions: Array<{ streamId: string, defaultName: string, level: string }> = [];
  if (missingItemKeysSet.size > 0) {
    // Reuse the same min-permission computation that CollectorRequest.buildPermissions uses.
    // Pass existing permissions as `preRequest` so the result merges cleanly with what's there.
    const preRequest = req.permissions
      .filter((p) => typeof p?.streamId === 'string')
      .map((p) => ({ streamId: p.streamId, defaultName: p.defaultName, level: p.level }));
    const merged: Array<{ streamId: string, defaultName: string, level: string }> = model.authorizations.forItemKeys(
      Array.from(missingItemKeysSet),
      { preRequest: preRequest as any }
    ) as any;
    // Only return entries the request doesn't already have (same streamId + same level).
    proposedPermissions = merged.filter((p) => {
      const existing = existingByStreamId[p.streamId];
      if (!existing) return true;
      return existing.level !== p.level;
    });
  }

  return {
    ok: perQuestion.every((c) => !c.missing),
    perQuestion,
    unknownItems,
    proposedPermissions
  };
}
