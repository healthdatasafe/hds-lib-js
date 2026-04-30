import { localizeText } from '../localizeText.ts';
import type { HDSModel } from './HDSModel.ts';

export interface ReminderConfig {
  cooldown?: string;
  expectedInterval?: { min?: string; max?: string };
  relativeTo?: string;
  relativeDays?: number[];
  importance?: 'may' | 'should' | 'must';
}

export class HDSItemDef {
  #data: any;
  #key: string;
  /**
   * Optional model handle, used to validate descendant streamIds in
   * `eventTemplate({ context })`. Constructed by HDSModelItemsDefs which has
   * the model handle available; older callers that build HDSItemDef directly
   * still work — they just can't use the `context` option.
   */
  #model: HDSModel | null;

  constructor (key: string, definitionData: any, model: HDSModel | null = null) {
    this.#key = key;
    this.#data = definitionData;
    this.#model = model;
  }

  get eventTypes (): string[] {
    if (this.#data.eventType) return [this.#data.eventType];
    return this.#data.variations.eventType.options.map((o: any) => o.value);
  }

  get key (): string {
    return this.#key;
  }

  get data (): any {
    return this.#data;
  }

  get repeatable (): string {
    return this.#data.repeatable || 'unlimited';
  }

  /**
   * Whether this item is deprecated. Deprecated items remain readable
   * (existing events keep validating + rendering) but should not be
   * surfaced in UIs that let users create new events. See
   * `data-model/AGENTS.md § "deprecated: true on items"`.
   */
  get isDeprecated (): boolean {
    return this.#data.deprecated === true;
  }

  get reminder (): ReminderConfig | null {
    return this.#data.reminder || null;
  }

  /** label Localized */
  get label (): string {
    return localizeText(this.#data.label);
  }

  /** description Localized */
  get description (): string {
    return localizeText(this.#data.description);
  }

  /**
   * a template event with eventType and streamIds
   *
   * @param opts.context — optional context streamId per Plan 46 §2.1 (D3).
   *   Must equal `this.streamId` or be a descendant. Lets a single itemDef
   *   registered at e.g. `treatment` produce events placed at `treatment-fertility`,
   *   `treatment-oncology`, etc., without per-domain item definitions.
   *   When omitted, falls back to the itemDef's canonical streamId.
   *   Throws if the context isn't in the itemDef's subtree.
   *
   * // TODO handle variations
   */
  eventTemplate (opts: { context?: string } = {}): {
    streamIds: [string];
    type: string;
  } {
    let chosenStreamId = this.#data.streamId as string;
    if (opts.context != null && opts.context !== chosenStreamId) {
      this.#assertDescendantOf(opts.context, chosenStreamId);
      chosenStreamId = opts.context;
    }
    return {
      streamIds: [chosenStreamId],
      type: this.eventTypes[0]
    };
  }

  /**
   * Throws if `candidate` is not a descendant of `ancestor` in the model's
   * stream tree. Requires the model handle (passed at construction).
   */
  #assertDescendantOf (candidate: string, ancestor: string): void {
    if (!this.#model) {
      throw new Error(`HDSItemDef "${this.#key}" was constructed without a model handle; cannot validate context "${candidate}"`);
    }
    // getParentsIds returns ancestors (excluding self). Treat candidate as
    // valid iff `ancestor` is in its parent chain.
    const ancestors = this.#model.streams.getParentsIds(candidate, false);
    if (!ancestors.includes(ancestor)) {
      throw new Error(`Context streamId "${candidate}" is not a descendant of itemDef "${this.#key}" streamId "${ancestor}"`);
    }
  }
}
