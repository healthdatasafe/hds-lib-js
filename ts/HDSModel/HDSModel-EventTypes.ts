import { HDSModel } from './HDSModel';

/**
 * Streams - Extension of HDSModel
 */
export class HDSModelEventTypes {
  /**
   * Model instance
   */
  #model: HDSModel;

  constructor (model: HDSModel) {
    this.#model = model;
  }

  getEventTypeDefinition (eventType: string) {
    return this.#model.modelData.eventTypes.types[eventType];
  }

  getEventTypeExtra (eventType: string) {
    return this.#model.modelData.eventTypes.extras[eventType];
  }

  getEventTypeSymbol (eventType: string): string | null {
    return this.#model.modelData.eventTypes.extras[eventType]?.symbol || null;
  }
}
