const { localizeText } = require('../localizeText');

class HDSItemDef {
  #data;
  #key;

  constructor (key, definitionData) {
    this.#key = key;
    this.#data = definitionData;
  }

  get eventTypes () {
    if (this.#data.eventType) return [this.#data.eventType];
    return Object.keys(this.#data.variations.eventType);
  }

  get key () {
    return this.#key;
  }

  get data () {
    return this.#data;
  }

  /** @type {string} label Localized */
  get label () {
    return localizeText(this.#data.label);
  }

  /** @type {string} description Localized */
  get description () {
    return localizeText(this.#data.description);
  }
}

module.exports = HDSItemDef;
