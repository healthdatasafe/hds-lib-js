import { HDSModel } from './HDSModel.ts';

export interface AppStreamDef {
  key: string;
  suffix: string;
  eventType: string;
  label: { [lang: string]: string };
  description: { [lang: string]: string };
  display: string;
}

/**
 * AppStreams - Extension of HDSModel
 *
 * Manages app-contextual stream definitions.
 * Each app/bridge access declares `clientData.appStreamId` (e.g. "bridge-mira-app").
 * AppStreams definitions declare sub-streams by suffix (e.g. suffix "notes" → "bridge-mira-app-notes").
 */
export class HDSModelAppStreams {
  #model: HDSModel;
  #defs: AppStreamDef[] | null;

  constructor (model: HDSModel) {
    this.#model = model;
    this.#defs = null;
  }

  /** Get all app stream definitions */
  getAll (): AppStreamDef[] {
    if (!this.#defs) {
      this.#defs = [];
      const raw = this.#model.modelData.appStreams || {};
      for (const [key, def] of Object.entries(raw)) {
        const d = def as any;
        this.#defs.push({
          key,
          suffix: d.suffix,
          eventType: d.eventType,
          label: d.label || {},
          description: d.description || {},
          display: d.display || 'diary',
        });
      }
    }
    return this.#defs;
  }

  /** Get an app stream definition by key (e.g. "notes", "chat") */
  forKey (key: string): AppStreamDef | null {
    return this.getAll().find(d => d.key === key) || null;
  }

  /**
   * Resolve the full stream ID for an app stream definition given an appStreamId.
   * E.g. resolveStreamId("bridge-mira-app", "notes") → "bridge-mira-app-notes"
   */
  resolveStreamId (appStreamId: string, key: string): string | null {
    const def = this.forKey(key);
    if (!def) return null;
    return `${appStreamId}-${def.suffix}`;
  }

  /**
   * Resolve all app sub-stream IDs for a given appStreamId.
   * Returns a map of key → full stream ID.
   * E.g. resolveAll("bridge-mira-app") → { notes: "bridge-mira-app-notes", chat: "bridge-mira-app-chat" }
   */
  resolveAll (appStreamId: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const def of this.getAll()) {
      result[def.key] = `${appStreamId}-${def.suffix}`;
    }
    return result;
  }

  /**
   * Check if a streamId belongs to an app stream.
   * Returns the app stream definition key if matched, null otherwise.
   * E.g. matchStream("bridge-mira-app-notes", "bridge-mira-app") → "notes"
   */
  matchStream (streamId: string, appStreamId: string): string | null {
    for (const def of this.getAll()) {
      if (streamId === `${appStreamId}-${def.suffix}`) return def.key;
    }
    return null;
  }

  /**
   * Extract appStreamId from an access's clientData.
   * Returns null if not set.
   */
  static getAppStreamId (access: { clientData?: Record<string, any> }): string | null {
    return access?.clientData?.appStreamId || null;
  }
}
