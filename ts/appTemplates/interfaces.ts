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

// ---- Contact abstraction ---- //

export type ContactSourceType = 'collector' | 'bridge' | 'other';

export interface ChatStreams {
  main: string;
  incoming: string;
}

export interface Permission {
  streamId: string;
  defaultName?: string;
  level: string;
}

/**
 * Uniform interface for extracting contact info from different access types.
 * Implemented by CollectorClient, and used to wrap bridge/raw accesses.
 */
export interface ContactSource {
  /** Remote user's Pryv username. null for bridges/services. */
  remoteUsername: string | null;
  displayName: string;
  chatStreams: ChatStreams | null;
  appStreamId: string | null;
  permissions: Permission[];
  status: string;
  type: ContactSourceType;
  accessId: string | null;
}

// ---- Access update requests ---- //

export type AccessUpdateAction = 'update-permissions' | 'add-feature' | 'revoke-request';

/**
 * Content of a `request/access-update-v1` event.
 * Written by the Requester (doctor) in their public stream.
 * Read by the Sender (patient) via requesterConnection.
 */
export interface AccessUpdateRequestContent {
  version: 0;
  /** Matches CollectorClient.key — identifies which access to update */
  targetAccessName: string;
  action: AccessUpdateAction;
  /** New full permission set (not a diff) — what the patient will grant */
  permissions: Permission[];
  /** Optional new features to add (e.g. chat) */
  features?: Record<string, any>;
  /** Human-readable explanation shown to patient */
  message?: string;
}

/** A pending update request attached to a CollectorClient */
export interface AccessUpdateRequest {
  /** The event ID on the requester's account */
  eventId: string;
  content: AccessUpdateRequestContent;
}
