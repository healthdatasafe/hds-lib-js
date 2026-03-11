import { localizableText } from '../localizeText.js';

export type RequestSectionType = 'recurring' | 'permanent';

export interface CollectorSectionInterface {
  key: string,
  type: RequestSectionType,
  name: localizableText,
  /**
   * @property {Array<string>} itemKeys - a list of known HDSItemDef key
   */
  itemKeys: Array<string>,
  itemCustomizations?: Record<string, Record<string, unknown>>
}
