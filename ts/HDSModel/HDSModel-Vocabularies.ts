import { HDSModel } from './HDSModel.ts';
import { localizeText } from '../localizeText.ts';

export interface VocabularyValue {
  label: { [lang: string]: string };
  /** FHIR code of the bound element (a required binding, written with no system) */
  fhir?: string;
  /** SNOMED CT SCTID */
  snomed?: string;
}

export interface VocabularyDef {
  key: string;
  /** FHIR element the values map to, e.g. `Timing.repeat.when` */
  fhirElement?: string;
  /** The eventType fields these values label (`path` is dotted inside the content) */
  binds: Array<{ eventType: string; path: string }>;
  /** Values in the order of the bound enum */
  values: { [value: string]: VocabularyValue };
}

/**
 * Vocabularies - Extension of HDSModel
 *
 * Labels and code mappings of eventType enum values (data-model 3.46.0, pack section `vocabularies`), e.g. the
 * medication `when` slots, a dose's status and skip reason. A pack without the section has no vocabulary.
 */
export class HDSModelVocabularies {
  #model: HDSModel;

  constructor (model: HDSModel) {
    this.#model = model;
  }

  #raw (): { [key: string]: any } {
    return this.#model.modelData.vocabularies || {};
  }

  /** Get a vocabulary by key (e.g. "medication-skip-reason") */
  forKey (key: string): VocabularyDef | null {
    const v = this.#raw()[key];
    return v ? { key, ...v } : null;
  }

  /** The vocabulary labelling a field of an eventType (`path` dotted, e.g. "intake.when"), or null */
  forField (eventType: string, path: string): VocabularyDef | null {
    for (const [key, v] of Object.entries(this.#raw())) {
      if ((v as any).binds?.some((b: any) => b.eventType === eventType && b.path === path)) return { key, ...(v as any) };
    }
    return null;
  }

  /** Localized label of a value, or null when the vocabulary or the value is unknown */
  label (key: string, value: string): string | null {
    const label = this.#raw()[key]?.values?.[value]?.label;
    return label ? localizeText(label) : null;
  }
}
