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
