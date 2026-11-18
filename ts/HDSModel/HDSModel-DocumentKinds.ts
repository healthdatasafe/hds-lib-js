import { HDSModel } from './HDSModel.ts';
import { localizeText } from '../localizeText.ts';

const SNOMED = 'http://snomed.info/sct';
const RECORD_ARTIFACT = '419891008';

/** A SNOMED CT Coding of the table, copied as it is into `file/xds-v1` content */
export interface DocumentKindCoding {
  system: string;
  /** the Swiss edition (`http://snomed.info/sct/2011000195101`) for a Swiss-extension concept only */
  version?: string;
  code: string;
  display: string;
}

export interface DocumentKindDef {
  key: string;
  /** en, fr; de and it from the CH Term designations (not reachable through `localizeText`) */
  label: { [lang: string]: string };
  /** when to pick this kind: en, fr */
  description: { [lang: string]: string };
  /** `class` of the document */
  class: DocumentKindCoding;
  /** first coding of the document's `type` */
  type: DocumentKindCoding;
  /** the writer's default for which printed date is the event time: the care reported, or `creation` */
  timeBasis: 'service' | 'creation';
  /** a pair a later CH Term release dropped: still read back, never offered */
  deprecated?: true;
}

interface CodingLike { system?: unknown; code?: unknown }

/**
 * Document kinds - Extension of HDSModel
 *
 * The class and first type of a `file/xds-v1` document by kind (data-model 4.17.0, pack section `documentKinds`,
 * DOCUMENTS.md § Document kinds), one kind per pair of the CH Term ConceptMap. A pack without the section has no
 * kind.
 */
export class HDSModelDocumentKinds {
  #model: HDSModel;

  constructor (model: HDSModel) {
    this.#model = model;
  }

  #raw (): { [key: string]: any } {
    return this.#model.modelData.documentKinds?.kinds || {};
  }

  /** The kinds a person or an importer picks from, in the pack's order (deprecated ones left out) */
  getAll (): DocumentKindDef[] {
    return Object.entries(this.#raw()).filter(([, k]) => !k.deprecated).map(([key, k]) => ({ key, ...k }));
  }

  /** A kind by key (e.g. "laboratory-report"), deprecated ones included; null when unknown */
  forKey (key: string): DocumentKindDef | null {
    const k = this.#raw()[key];
    return k ? { key, ...k } : null;
  }

  /**
   * The kind of a document's content, or null when its codes are in no kind. Reads the first SNOMED CT coding of
   * `type` (another writer may lead with a LOINC one): it identifies the kind, except Record artifact, where `class`
   * does. Deprecated kinds are found too, so a stored document still reads back.
   */
  forContent (content: { class?: CodingLike; type?: CodingLike[] } | null | undefined): DocumentKindDef | null {
    const type = Array.isArray(content?.type) ? content.type.find((c) => c?.system === SNOMED) : undefined;
    if (typeof type?.code !== 'string') return null;
    const cls = content?.class;
    const classCode = cls?.system === SNOMED && typeof cls.code === 'string' ? cls.code : null;
    for (const [key, k] of Object.entries(this.#raw())) {
      if (k.type.code !== type.code) continue;
      if (type.code === RECORD_ARTIFACT && k.class.code !== classCode) continue;
      return { key, ...k };
    }
    return null;
  }

  /** Localized label of a kind (en, fr, es), or null when unknown */
  label (key: string): string | null {
    const label = this.#raw()[key]?.label;
    return label ? localizeText(label) : null;
  }
}
