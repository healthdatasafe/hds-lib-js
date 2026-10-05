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
  /** Optional purpose tag for UI (e.g. 'system-out', 'system-in', 'cross-app-correlation', 'app-private'). */
  purpose?: string;
  /** Optional display label (data-set templates: names an app-private stream for the reader). */
  label?: localizableText;
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

  // ---- Data-set template extension (plan 108) — all optional, see DatasetTemplate ---- //

  /** Pointer to the JSON Schema, informational. */
  $schema?: string;
  /** Marks the file as a published data-set template. When present, `version` and `app` are required. */
  format?: typeof DATASET_TEMPLATE_FORMAT;
  /** Schema version of the data-set template format. Bumped only when the format itself breaks. */
  formatVersion?: 1;
  /** Content version (semver): major = scope narrows or a grant changes, minor = additive, patch = texts. */
  version?: string;
  /** Publication date of this content version (ISO-8601 date). */
  publishedAt?: string;
  /** The publishing app. */
  app?: DatasetTemplateApp;
  /** Informational: the data-model pack the template was authored against. Compatibility is resolved, not compared. */
  dataModel?: { publicationDate?: string };
  /** The app's proposed consent text; the data-set owner may edit it. */
  consent?: localizableText;
  /** Bridges the data set expects to be connected (carried to FormSpec.appCustomData.requiredBridges). */
  requiredBridges?: string[];
}

/** `format` value identifying a published data-set template. */
export const DATASET_TEMPLATE_FORMAT = 'hds-dataset-template';

/** `purpose` value for an app's own (non data-model) streams referenced by a data-set template. Read-only. */
export const APP_PRIVATE_PURPOSE = 'app-private';

/** Identity of the app publishing a data-set template. */
export interface DatasetTemplateApp {
  id: string;
  name: localizableText;
  publisher: string;
  /** HTTPS URL of the app. */
  url: string;
  contact?: string;
  appVersion?: string;
}

/**
 * A published data-set template (plan 108): an AppTemplate an app exposes at a URL
 * (`hds-dataset.json`) to describe the data it collects. Same shape as AppTemplate with
 * the publication fields required.
 */
export type DatasetTemplate = AppTemplate & {
  format: typeof DATASET_TEMPLATE_FORMAT;
  formatVersion: 1;
  version: string;
  app: DatasetTemplateApp;
};
