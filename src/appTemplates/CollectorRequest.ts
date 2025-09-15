import { HDSLibError } from '../errors.js';
import { validateLocalizableText } from '../localizeText.js';
import type { localizableText } from '../../types/localizeText.d.ts';

declare type PermissionItem = {streamId: string, defaultName: string, level: string};

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

  #extraContent: any;
  constructor (content: any) {
    this.#version = 0;
    this.#requester = { name: null };
    this.#app = { id: null, url: null, data: {} };
    this.#permissions = [];
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
    if (futureContent.version) {
      const numV = Number.parseInt(futureContent.version);
      if (numV !== this.#version) throw new HDSLibError(`Invalid CollectorRequest content version: ${futureContent.version}`);
      delete futureContent.version;
    }

    for (const key of ['title', 'consent', 'description']) {
      if (futureContent[key] != null) {
        this[key] = futureContent[key];
      }
      delete futureContent[key];
    }
    if (futureContent.requester) {
      if (futureContent.requester.name != null) {
        this.requesterName = futureContent.requester.name;
      }
      delete futureContent.requester;
    }
    if (futureContent.app) {
      if (futureContent.app.id != null) { this.appId = futureContent.app.id; }
      if (futureContent.app.url != null) { this.appUrl = futureContent.app.url; }
      if (futureContent.app.data != null) { this.appCustomData = futureContent.app.data; }
      delete futureContent.app;
    }

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

  // ---------- permissions ---------- //
  addPermissions (streamId: string, defaultName: string, level: string) {
    this.#permissions.push({streamId, defaultName, level});
  }

  /**
   * Return Content to comply with initial implementation as an object
   */
  get content () {
    const content = {
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
      }
    };
    Object.assign(content, this.#extraContent);
    return content;
  }
}

function validateString (key, totest) {
  if (totest == null || typeof totest !== 'string') throw new HDSLibError(`Invalid ${key} value: ${totest}`, { [key]: totest });
  return totest;
}


