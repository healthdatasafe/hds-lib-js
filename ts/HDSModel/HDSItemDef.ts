import { localizeText } from '../localizeText.ts';
import { HDSLibError } from '../errors.ts';
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
   * @param opts.eventType — REQUIRED for an itemDef declaring `variations.eventType`
   *   (`body-weight`, `body-height`, `body-blood-serum-glucose-fasting`, `profile-avatar`).
   *   Must be one of the declared options.
   *
   * For a variation item the option **is** the stored value's meaning: `mass/kg` vs
   * `mass/lb` is the difference between 75 kg and 75 lb. Until 2.0.0 this returned
   * `eventTypes[0]` whatever the caller meant, so a weight entered in pounds was stored
   * as kilograms with nothing failing anywhere (issue #13). It now throws instead: a
   * caller that has not chosen cannot express intent, and guessing on their behalf is
   * what produced wrong clinical values.
   *
   * Deliberately NOT resolved from `unitSystem` here. That would couple this primitive
   * to ambient settings state and return a different unit for the same itemDef depending
   * on whether an app had hooked its settings, which is a quieter version of the same
   * bug. Callers that want the user's preference resolve it themselves (see
   * `HDSModelPreferred`) and pass the result in.
   */
  eventTemplate (opts: { context?: string; eventType?: string } = {}): {
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
      type: this.#chooseEventType(opts.eventType)
    };
  }

  /**
   * Resolve the event type for `eventTemplate()`, refusing to guess.
   * Variation items require an explicit choice; plain items reject a mismatched one.
   */
  #chooseEventType (requested?: string): string {
    const isVariation = this.#data.variations?.eventType != null;
    const options = this.eventTypes;

    if (!isVariation) {
      if (requested != null && requested !== options[0]) {
        throw new HDSLibError(
          `eventTemplate: item "${this.#key}" declares eventType "${options[0]}" ` +
          `and cannot produce "${requested}".`
        );
      }
      return options[0] as string;
    }

    if (requested == null) {
      throw new HDSLibError(
        `eventTemplate: item "${this.#key}" declares variations.eventType and requires an ` +
        `explicit choice. Pass one of: ${options.join(', ')}. ` +
        'The option is the stored unit, so choosing for you would risk storing a wrong value.'
      );
    }
    if (!options.includes(requested)) {
      throw new HDSLibError(
        `eventTemplate: "${requested}" is not a declared variation of item "${this.#key}". ` +
        `Expected one of: ${options.join(', ')}.`
      );
    }
    return requested;
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

  /**
   * D3-aware event-matching. Returns true if the given event resolves to
   * this itemDef via `model.itemsDefs.forEvent(event)` — covering both the
   * direct (streamId, eventType) match and the closest-ancestor walk-up.
   *
   * Useful in form-engine code that needs to check whether an event belongs
   * to a particular itemDef without re-implementing the resolution rule.
   * Falls back to plain `(streamId in event.streamIds, type === eventType)`
   * if the model handle isn't available.
   */
  matchesEvent (event: { type?: string; streamIds?: string[] }): boolean {
    if (!event || event.type == null || !Array.isArray(event.streamIds)) return false;
    if (this.#model) {
      const resolved = this.#model.itemsDefs.forEvent(event, false);
      return resolved !== null && resolved.key === this.#key;
    }
    // Fallback: direct match against this itemDef's streamId + eventType.
    if (!this.eventTypes.includes(event.type)) return false;
    return event.streamIds.includes(this.#data.streamId);
  }
}
