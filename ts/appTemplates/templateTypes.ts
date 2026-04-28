/**
 * AppTemplate type definitions (Plan 45 §1).
 *
 * Top-level shape used by templates loaded via `loadTemplate(json | url)`.
 * Three stream-reference modes (§2.9): canonical (sections.itemKeys), provision-new
 * (customFields), and existing-stream-ref (existingStreamRefs).
 */

import { type localizableText } from '../localizeText.ts';
import { type CustomFieldEventType, type HDSCustomFieldDef } from './customFieldTypes.ts';

/** Permissions a CollectorRequest can request. Mirrors Pryv access permission levels. */
export type StreamPermission = 'read' | 'manage' | 'contribute';

/** Mode-3 (§2.9) — request access on a pre-existing stream without provisioning. */
export interface ExistingStreamRef {
  streamId: string;
  permissions: StreamPermission[];
  /** Optional purpose tag for UI (e.g. 'system-out', 'system-in', 'cross-app-correlation'). */
  purpose?: string;
}

/** Mode-2 (§2.9) — provision-new declaration; one entry per (streamId, eventType) pair. */
export interface CustomFieldDeclaration {
  /** The streamId to provision. MUST start with `{templateId}-` (sandbox rule, §2.9). */
  streamId: string;
  /** Event type the field stores under. Must be one of CustomFieldEventType. */
  eventType: CustomFieldEventType;
  /** Field-def carried into `clientData.hdsCustomField[<eventType>]`. */
  def: HDSCustomFieldDef;
  /** Optional parent streamId; defaults to `{templateId}-custom`. */
  parentId?: string;
  /** Optional human-readable name for the stream. Defaults to `def.label` localized to the system locale. */
  name?: string;
}

/** A CollectorRequest's section. Existing canonical itemKeys plus optional customField refs. */
export interface AppTemplateSection {
  key: string;
  type: 'permanent' | 'recurring';
  name: localizableText;
  /** Mode-1 — canonical itemKeys. */
  itemKeys?: string[];
  /** Customizations applied to canonical items (existing plan-44 mechanism). */
  itemCustomizations?: Record<string, unknown>;
  /** Mode-2 — keys of customFields[] entries displayed in this section. */
  customFieldKeys?: string[];
}

/** Top-level template JSON, validated by Ajv at load time. */
export interface AppTemplate {
  id: string;
  title: localizableText;
  description: localizableText;
  chat: boolean;
  sections: AppTemplateSection[];

  /** Mode-2 — provision-new declarations. Each streamId MUST start with `{id}-`. */
  customFields?: CustomFieldDeclaration[];

  /** Mode-3 — access asks on existing streams. */
  existingStreamRefs?: ExistingStreamRef[];

  /** License attribution for derivative templates (plan 44). */
  license?: { name: string, url?: string, notice: localizableText };
}
