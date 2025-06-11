class HDSItemDef {
  #data;

  constructor (definitionData) {
    this.#data = definitionData;
  }

  get types () {
    if (this.#data.eventType) return [this.#data.eventType];
    return Object.keys(this.#data.variations.eventType);
  }

  get data () {
    return this.#data;
  }
}

module.exports = HDSItemDef;
