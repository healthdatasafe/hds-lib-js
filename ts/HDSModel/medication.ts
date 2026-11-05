/**
 * Medications (data-model 3.46.0, documentation/MEDICATION.md). The `medication-intake` stream holds two kinds of fact,
 * told apart by the event's duration, which the schema cannot see: **one intake** (a dose: no duration, or 0) and **a
 * period of use** (a duration; `null` = ongoing). On a period `status` / `skipReason` are ignored; on a dose
 * `stopReason` and the regimen's timing are.
 */
import { localizeText } from '../localizeText.ts';

export const MEDICATION_INTAKE_TYPES: readonly string[] = ['medication/basic', 'medication/coded-v1'];
export const MEDICATION_PRESCRIPTION_TYPES: readonly string[] = ['medication/prescription-v1', 'medication/prescription-basic-v1'];

export type MedicationIntakeKind = 'intake' | 'period';

/** `'intake'` for one dose (no duration, or 0), `'period'` for a period of use (a duration, `null` = ongoing). */
export function medicationIntakeKind (event: { duration?: number | null }): MedicationIntakeKind {
  return event?.duration === undefined || event.duration === 0 ? 'intake' : 'period';
}

/** True for one intake recorded as not taken (`status: skipped`); always false on a period. */
export function isSkipped (event: any): boolean {
  return MEDICATION_INTAKE_TYPES.includes(event?.type) && event.content?.status === 'skipped' && medicationIntakeKind(event) === 'intake';
}

/** True when a `drug` (or any datasource concept) carries at least one code. */
export function isCodedDrug (drug: any): boolean {
  return Array.isArray(drug?.codes) && drug.codes.some((c: any) => typeof c?.code === 'string' && c.code !== '');
}

const STOPPED = { en: 'stopped', fr: 'arrêté', es: 'suspendido' };

function lowerFirst (s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * The state of a medication event for its short text, or null when there is nothing to say: a skipped dose
 * "skipped (forgot)", an ended period with a reason "stopped (side effects)", a prescription "stopped (…)" /
 * "completed". `label(vocabulary, value)` returns the value's localized label.
 */
export function medicationStatusText (event: any, label: (vocabulary: string, value: string) => string): string | null {
  const c = event?.content;
  if (c == null || typeof c !== 'object') return null;
  if (MEDICATION_INTAKE_TYPES.includes(event.type)) {
    if (isSkipped(event)) {
      const reason = typeof c.skipReason === 'string' ? ` (${lowerFirst(label('medication-skip-reason', c.skipReason))})` : '';
      return lowerFirst(label('medication-intake-status', 'skipped')) + reason;
    }
    // An ended period (a duration, not `null`): its reason only, ending as planned says nothing.
    if (typeof event.duration === 'number' && event.duration > 0 && typeof c.stopReason === 'string') {
      return `${localizeText(STOPPED)} (${lowerFirst(label('medication-stop-reason', c.stopReason))})`;
    }
    return null;
  }
  if (MEDICATION_PRESCRIPTION_TYPES.includes(event.type) && (c.status === 'stopped' || c.status === 'completed')) {
    const reason = c.status === 'stopped' && typeof c.stopReason === 'string' ? ` (${lowerFirst(label('medication-stop-reason', c.stopReason))})` : '';
    return lowerFirst(label('medication-prescription-status', c.status)) + reason;
  }
  return null;
}
