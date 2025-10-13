import { localizeText } from '../localizeText';

export default class HDSItemDef {
  #data: any;
  #key: string;

  constructor (key: string, definitionData: any) {
    this.#key = key;
    this.#data = definitionData;
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
   * // TODO handle variations
   */
  eventTemplate (): {
    streamId: string;
    type: string;
    } {
    return {
      streamId: this.#data.streamId,
      type: this.eventTypes[0]
    };
  }
}
