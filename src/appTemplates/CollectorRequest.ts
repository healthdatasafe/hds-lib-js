import { HDSLibError } from '../errors.js';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton.js';
import { validateLocalizableText } from '../localizeText.js';
import type { localizableText, localizableTextLanguages } from '../../types/localizeText.d.ts';


declare type PermissionItem = {streamId: string, defaultName: string, level: string};

const CURRENT_VERSION = 1;

/**
 * Each Collector has one Request
 * Which contains
 * - the name of the requester
 * - a title
 * - a description
 * - a consent message
 * - a set of permission requests
 * - a version
 */
export class CollectorRequest {
  #version: number;
  #title: localizableText;
  #description: localizableText;
  #consent: localizableText;
  #requester: {name: string};
  #app: {id: string, url: string | null, data: any};
  #permissions: Array<PermissionItem>;
  #sections: Array<CollectorRequestSection>;

  #extraContent: any;
  constructor (content: any) {
    this.#version = CURRENT_VERSION;
    this.#requester = { name: null };
    this.#app = { id: null, url: null, data: {} };
    this.#permissions = [];
    this.#sections = [];
    this.setContent(content);
  }

  /**
   * Loadfrom status event
   * used by Collector only
   * @param statusEvent 
   */
  loadFromStatusEvent(statusEvent: any) {
    // content.data is deprecated it was used in a previous version, should be removed
    let potentialContent = statusEvent.content.request || statusEvent.content.data;
    // for some reason to be investigated sometime the data is in requestContent
    if (potentialContent.requestContent) potentialContent = potentialContent.requestContent;
    this.setContent(potentialContent);
  }

  /**
   * Temp content
   * @param content 
   */
  setContent(content: any) {
    const futureContent = structuredClone(content);
    
    // validate content
    if (futureContent.version != null) {
      const numV = Number.parseInt(futureContent.version);
      if (numV === 0) {
        vo0ToV1(futureContent); // convert to v1 if needed
      } else {  
        if (numV !== this.#version) throw new HDSLibError(`Invalid CollectorRequest content version: ${futureContent.version}`);
      }
      delete futureContent.version;
    }

    // -- title, consent, description
    for (const key of ['title', 'consent', 'description']) {
      if (futureContent[key] != null) {
        this[key] = futureContent[key];
      }
      delete futureContent[key];
    }

    // -- requester 
    if (futureContent.requester) {
      if (futureContent.requester.name != null) {
        this.requesterName = futureContent.requester.name;
      }
      delete futureContent.requester;
    }

    // -- app
    if (futureContent.app) {
      if (futureContent.app.id != null) { this.appId = futureContent.app.id; }
      if (futureContent.app.url != null) { this.appUrl = futureContent.app.url; }
      if (futureContent.app.data != null) { this.appCustomData = futureContent.app.data; }
      delete futureContent.app;
    }

    // -- sections
    if (futureContent.sections != null) {
      for (const sectionData of futureContent.sections) {
        const section = new CollectorRequestSection(sectionData.key, sectionData.type);
        section.setName(sectionData.name);
        section.addItemKeys(sectionData.itemKeys);
        this.#sections.push(section);
      }
    }

    // -- permissions
    if (futureContent.permissions) {
      this.#permissions = []; // reset permissions
      futureContent.permissions.forEach((p: PermissionItem)=> {
        this.addPermissions(p.streamId, p.defaultName, p.level);
      });
      delete futureContent.permissions;
    }

    this.#extraContent = futureContent;
  }

  // ------------- getter and setters ------------ //

  get version () { return this.#version; }

  set title (title: localizableText) { this.#title = validateLocalizableText('title', title); }
  get title () { return this.#title; }

  set consent (consent: localizableText) { this.#consent = validateLocalizableText('consent', consent); }
  get consent () { return this.#consent; }

  set description (description: localizableText) { this.#description = validateLocalizableText('description', description); }
  get description () { return this.#description; }

  set requesterName (name: string) { this.#requester.name = validateString('requester:name', name); }
  get requesterName () { return  this.#requester.name; }


  set appId(id: string) { this.#app.id = validateString('app:id', id); }
  get appId() { return this.#app.id; }

  set appUrl(url: string) { this.#app.url = validateString('app:url', url); }
  get appUrl() { return this.#app.url; }

  set appCustomData(data: any) { this.#app.data = data; }
  get appCustomData() { return this.#app.data; }

  get permissions() { return this.#permissions; }

  get sectionsData() {
    const result = [];
    for (const section of this.#sections) {
      result.push(section.getData());
    }
    return result;
  }

  // ---------- permissions ---------- //
  addPermissions (streamId: string, defaultName: string, level: string) {
    this.#permissions.push({streamId, defaultName, level});
  }

  /**
   * Return Content to comply with initial implementation as an object
   */
  get content () {
    const content = {
      version: this.version,
      title: this.title,
      consent: this.consent,
      description: this.description,
      requester: {
        name: this.requesterName
      },
      permissions: this.permissions,
      app: {
        id: this.appId,
        url: this.appUrl,
        data: this.appCustomData
      },
      sections: this.sectionsData
    };
    Object.assign(content, this.#extraContent);
    return content;
  }
}

function validateString (key, totest) {
  if (totest == null || typeof totest !== 'string') throw new HDSLibError(`Invalid ${key} value: ${totest}`, { [key]: totest });
  return totest;
}

const RequestSectionType = {
  recurring: 'recurring',
  permanent: 'permanent'
}
type RequestSectionType = (typeof RequestSectionType )[keyof typeof RequestSectionType ];

class CollectorRequestSection {
  #type: RequestSectionType;
  #name: localizableText;
  #key: string;
  #itemKeys: Array<string>;

  constructor (key: string, type: RequestSectionType) {
    this.#key = key;
    this.#type = type;
    this.#itemKeys = [];
    this.#name = {
      en: ''
    }
  }

  addItemKeys(keys: Array<string>) {
    keys.forEach((k) => this.addItemKey(k));
  }

  addItemKey(key: string) {
    getModel().itemsDefs.forKey(key); // will throw error if not found
    if (this.#itemKeys.includes(key)) return; // avoid double entries
    this.#itemKeys.push(key);
  }

  setName(localizedName: localizableText) {
    for (const [languageCode, name] of Object.entries(localizedName)) {
      this.setNameLocal(languageCode as localizableTextLanguages, name);
    }
  }

  setNameLocal(languageCode: localizableTextLanguages, name: string) {
    this.#name[languageCode] = name;
  }

  get type() { return this.#type }
  get key() { return this.#key }
  get itemKeys() { return this.#itemKeys }

  getData() {
    return {
      key: this.key,
      type: this.#type,
      name: this.#name,
      itemKeys: this.#itemKeys
    }
  }

}

/**
 * Transform data to match v1
 * @param v0Data
 */
function vo0ToV1(v0Data: any) {
  if (v0Data.app?.data?.forms) {
    if (v0Data.sections) throw new HDSLibError('Cannot mix data.forms & sections', v0Data);
    v0Data.sections = [];
    for (const [key, value] of Object.entries(v0Data.app.data.forms) as [key: string, value: any]) {
      value.key = key;
      value.name = {
        en: value.name
      }
      v0Data.sections.push(value)
    }
    delete v0Data.app.data.forms;
  }
  v0Data.version = 1;
}