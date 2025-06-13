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
}

module.exports = HDSItemDef;
