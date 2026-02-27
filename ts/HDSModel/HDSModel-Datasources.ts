import { HDSDatasourceDef } from './HDSDatasourceDef';
import { HDSModel } from './HDSModel';

/**
 * Datasources - Extension of HDSModel
 */
export class HDSModelDatasources {
  #model: HDSModel;
  #datasourceDefs: { [key: string]: HDSDatasourceDef };

  constructor (model: HDSModel) {
    this.#model = model;
    this.#datasourceDefs = {};
  }

  /**
   * get all datasource definitions
   */
  getAll (): HDSDatasourceDef[] {
    const res: HDSDatasourceDef[] = [];
    for (const key of Object.keys(this.#model.modelData.datasources || {})) {
      res.push(this.forKey(key));
    }
    return res;
  }

  /**
   * get datasource definition for a key
   */
  forKey (key: string, throwErrorIfNotFound: boolean = true): HDSDatasourceDef | null {
    if (this.#datasourceDefs[key]) return this.#datasourceDefs[key];
    const datasources = this.#model.modelData.datasources || {};
    const defData = datasources[key];
    if (!defData) {
      if (throwErrorIfNotFound) throw new Error('Cannot find datasource definition with key: ' + key);
      return null;
    }
    this.#datasourceDefs[key] = new HDSDatasourceDef(key, defData, () => this.#model.assets);
    return this.#datasourceDefs[key];
  }
}
