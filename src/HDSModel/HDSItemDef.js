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

  /**
   * a template event with eventType and streamIds
   * // TODO handle variations
   * @returns {Object}
   */
  eventTemplate () {
    return {
      streamIds: [this.#data.streamId],
      eventType: this.eventTypes[0]
    };
  }
}

module.exports = HDSItemDef;
