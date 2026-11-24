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
  /**
   * second coding of the document's `type`, of an HDS code system: tells apart a kind no CH Term pair names from the
   * kind that has the same class and type (data-model 4.32.0, pack section `documentKinds.detailKinds`). Write a kind's
   * codes with `codingsFor`.
   */
  detail?: DocumentKindCoding;
  /** the writer's default for which printed date is the event time: the care reported, or `creation` */
  timeBasis: 'service' | 'creation';
  /** the stream a document of this kind is filed under; read it with `streamFor` */
  stream?: string;
  /** a pair a later CH Term release dropped: still read back, never offered */
  deprecated?: true;
}

interface CodingLike { system?: unknown; code?: unknown }

/**
 * Document kinds - Extension of HDSModel
 *
 * The class and first type of a `file/xds-v1` document by kind (data-model 4.17.0, pack section `documentKinds`,
 * DOCUMENTS.md § Document kinds), one kind per pair of the CH Term ConceptMap, then the kinds with a `detail` code
 * (4.32.0, `detailKinds`, which an earlier version does not see). A pack without the section has no kind.
 */
export class HDSModelDocumentKinds {
  #model: HDSModel;

  constructor (model: HDSModel) {
    this.#model = model;
  }

  /** Every kind, a detail kind after the one it shares its codes with */
  #raw (): { [key: string]: any } {
    const { kinds = {}, detailKinds = {} } = this.#model.modelData.documentKinds ?? {};
    const all: { [key: string]: any } = {};
    for (const [key, k] of Object.entries<any>(kinds)) {
      all[key] = k;
      for (const [detailKey, d] of Object.entries<any>(detailKinds)) {
        if (d.class.code === k.class.code && d.type.code === k.type.code) all[detailKey] = d;
      }
    }
    return all;
  }

  /** The kinds a person or an importer picks from, in the pack's order, a detail kind after the one it shares its codes with (deprecated ones left out) */
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
   * does. Among the kinds these codes fit, one whose `detail` is also in `type` wins; without it, the one that has no
   * `detail`. Deprecated kinds are found too, so a stored document still reads back.
   */
  forContent (content: { class?: CodingLike; type?: CodingLike[] } | null | undefined): DocumentKindDef | null {
    const type = Array.isArray(content?.type) ? content.type.find((c) => c?.system === SNOMED) : undefined;
    if (typeof type?.code !== 'string') return null;
    const cls = content?.class;
    const classCode = cls?.system === SNOMED && typeof cls.code === 'string' ? cls.code : null;
    let found: DocumentKindDef | null = null;
    for (const [key, k] of Object.entries(this.#raw())) {
      if (k.type.code !== type.code) continue;
      if (type.code === RECORD_ARTIFACT && k.class.code !== classCode) continue;
      if (k.detail == null) found ??= { key, ...k };
      else if (content!.type!.some((c) => c?.system === k.detail.system && c?.code === k.detail.code)) return { key, ...k };
    }
    return found;
  }

  /**
   * The `class` and the whole `type` a writer puts in a document's content for a kind: `type`, then `detail` when the
   * kind has one. Copies; null for an unknown kind.
   */
  codingsFor (key: string): { class: DocumentKindCoding; type: DocumentKindCoding[] } | null {
    const k = this.#raw()[key];
    if (!k) return null;
    return { class: { ...k.class }, type: [{ ...k.type }, ...(k.detail == null ? [] : [{ ...k.detail }])] };
  }

  /**
   * The stream a document of this kind is filed under: the pack's `stream` when the model knows it, else `documents`
   * (not filed). A pack that states no stream, or an unknown kind, files nothing.
   */
  streamFor (key: string): string {
    const stream = this.#raw()[key]?.stream;
    return typeof stream === 'string' && this.#model.streams.getDataById(stream, false) != null ? stream : 'documents';
  }

  /** Localized label of a kind (en, fr, es), or null when unknown */
  label (key: string): string | null {
    const label = this.#raw()[key]?.label;
    return label ? localizeText(label) : null;
  }
}
