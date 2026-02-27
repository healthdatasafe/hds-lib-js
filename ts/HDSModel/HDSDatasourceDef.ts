import { localizeText } from '../localizeText';

type AssetsProvider = () => { [key: string]: string };

export class HDSDatasourceDef {
  #data: any;
  #key: string;
  #getAssets: AssetsProvider;

  constructor (key: string, definitionData: any, getAssets: AssetsProvider) {
    this.#key = key;
    this.#data = definitionData;
    this.#getAssets = getAssets;
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
   * Resolved endpoint URL.
   * If the raw endpoint starts with `http`, it is used as-is.
   * Otherwise it is treated as `<assetKey>://<path>` and resolved
   * against the service-info assets map.
   * e.g. `datasets://medication` → `assets.datasets` + `medication`
   */
  get endpoint (): string {
    const raw: string = this.#data.endpoint;
    if (raw.startsWith('http')) return raw;
    const sep = raw.indexOf('://');
    if (sep === -1) return raw;
    const assetKey = raw.substring(0, sep);
    const path = raw.substring(sep + 3);
    const assets = this.#getAssets();
    const baseUrl = assets[assetKey];
    if (!baseUrl) {
      throw new Error(`Cannot resolve datasource endpoint "${raw}": no asset "${assetKey}" in service-info`);
    }
    // Ensure proper URL joining (handle trailing slash on baseUrl)
    return baseUrl.endsWith('/') ? baseUrl + path : baseUrl + '/' + path;
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
