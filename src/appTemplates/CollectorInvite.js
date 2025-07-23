const pryv = require('pryv');
const { HDSLibError } = require('../errors');

/**
 * Collector Invite
 * There is one Collector Invite per Collector => Enduser connection
 */

class CollectorInvite {
  /**
   * get the key that will be assigne to this event;
   * @param {Event} eventData
   * @returns {string}
   */
  static getKeyForEvent (eventData) {
    return eventData.id;
  }

  /** @type {Collector} */
  collector;
  /** @type {Event} */
  eventData;
  /** @type {pryv.Connection} */
  #connection;
  /** @type {Object} accessInfo from account */
  #accessInfo;

  get key () {
    return CollectorInvite.getKeyForEvent(this.eventData);
  }

  get status () {
    return this.collector.inviteStatusForStreamId(this.eventData.streamIds[0]);
  }

  get apiEndpoint () {
    if (this.status !== 'active') {
      throw new HDSLibError('invite.apiEndpoint is accessible only when active');
    }
    return this.eventData.content.apiEndpoint;
  }

  /** @type {string} - on of 'revoked', 'refused' */
  get errorType () {
    return this.eventData.content?.errorType;
  }

  get dateCreation () {
    return new Date(this.eventData.created * 1000);
  }

  get connection () {
    if (this.#connection == null) {
      this.#connection = new pryv.Connection(this.apiEndpoint);
    }
    return this.#connection;
  }

  /**
   * Check if connection is valid. (only if active)
   * If result is "forbidden" update and set as revoked
   * @returns {Object} accessInfo if valid.
   */
  async checkAndGetAccessInfo (forceRefresh = false) {
    if (!forceRefresh && this.#accessInfo) return this.#accessInfo;
    try {
      this.#accessInfo = await this.connection.accessInfo();
      return this.#accessInfo;
    } catch (e) {
      this.#accessInfo = null;
      if (e.response?.body?.error?.id === 'invalid-access-token') {
        await this.collector.revokeInvite(this);
        return null;
      }
      throw e;
    }
  }

  get displayName () {
    return this.eventData.content.name;
  }

  constructor (collector, eventData) {
    if (eventData.type !== 'invite/collector-v1') throw new HDSLibError('Wrong type of event', eventData);
    this.collector = collector;
    this.eventData = eventData;
  }

  /**
   * private
   * @param {*} eventData
   */
  setEventData (eventData) {
    if (eventData.id !== this.eventData.id) throw new HDSLibError('CollectInvite event id does not match new Event');
    this.eventData = eventData;
  }

  async getSharingData () {
    if (this.status !== 'pending') throw new HDSLibError('Only pendings can be shared');
    return {
      apiEndpoint: await this.collector.sharingApiEndpoint(),
      eventId: this.eventData.id
    };
  }
}

module.exports = CollectorInvite;
