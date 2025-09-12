/**
 * Each Collector has one Request
 * Which contains
 * - the name of the requester
 * - a title
 * - an id
 * - a description
 * - a consent message
 * - a set of permission requests
 * - a version
 */

export class CollectorRequest {
  /** id */
  id: string;
  #content: any;
  constructor (content: any) {
    this.id = content.id || null;
    this.#content = content;
  }

  /**
   * Loadfrom status event
   * used by Collector only
   * @param statusEvent 
   */
  loadFromStatusEvent(statusEvent: any) {
    // content.data is deprecated it was used in a previous version, should be removed
    this.#content = statusEvent.content.request || statusEvent.content.data;
    // for some reason to be investigated sometime the data is in requestContent
    if (this.#content.requestContent) this.#content = this.#content.requestContent;
  }

  /**
   * Temp content
   * @param content 
   */
  setContent(content: any) {
    this.#content = content;
  }

  /**
   * Return 
   */
  get content () {
    return this.#content;
  }
}