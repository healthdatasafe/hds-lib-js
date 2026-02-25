import { localizeText } from '../localizeText';

export class HDSDatasourceDef {
  #data: any;
  #key: string;

  constructor (key: string, definitionData: any) {
    this.#key = key;
    this.#data = definitionData;
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

  get endpoint (): string {
    return this.#data.endpoint;
  }

  get queryParam (): string {
    return this.#data.queryParam;
  }

  get minQueryLength (): number {
    return this.#data.minQueryLength;
  }

  get resultKey (): string {
    return this.#data.resultKey;
  }

  get displayFields (): { label: string; description: string } {
    return this.#data.displayFields;
  }

  get valueFields (): string[] {
    return this.#data.valueFields;
  }
}
