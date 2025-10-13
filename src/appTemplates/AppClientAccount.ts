import { HDSLibError } from '../errors';
import pryv from '../patchedPryv';
import Application from './Application';
import CollectorClient from './CollectorClient';
import * as logger from '../logger';

/**
 * - applications
 *   - [baseStreamId] "Root" stream from this app
 */

const MAX_COLLECTORS = 1000;
export default class AppClientAccount extends Application {
  constructor (baseStreamId: string, connection: pryv.Connection, appName?: string, features?: any) {
    super(baseStreamId, connection, appName, features);
    this.cache.collectorClientsMap = {};
  }

  get appSettings (): any {
    return {
      canBePersonnal: true,
      mustBeMaster: true
    };
  }

  /**
   * When the app receives a new request for data sharing
   */
  async handleIncomingRequest (apiEndpoint: string, incomingEventId?: string): Promise<CollectorClient> {
    // make sure that collectorClientsMap is initialized
    await this.getCollectorClients();

    const requesterConnection = new pryv.Connection(apiEndpoint);
    const accessInfo = await requesterConnection.accessInfo();
    // check if request is known
    const collectorClientKey = CollectorClient.keyFromInfo(accessInfo);
    logger.debug('AppClient:handleIncomingRequest', { collectorClientKey, accessInfo, incomingEventId });
    if (this.cache.collectorClientsMap[collectorClientKey]) {
      const collectorClient = this.cache.collectorClientsMap[collectorClientKey];
      logger.debug('AppClient:handleIncomingRequest found existing', { collectorClient });
      if (collectorClient.requesterApiEndpoint !== apiEndpoint) {
        // console.log('⚠️⚠️⚠️⚠️ RESET! Found existing collectorClient with a different apiEndpoint', { actual: collectorClient.requesterApiEndpoint, incoming: apiEndpoint });
        throw new HDSLibError('Found existing collectorClient with a different apiEndpoint', { actual: collectorClient.requesterApiEndpoint, incoming: apiEndpoint });
        // we might consider reseting() in the future;
        // return await collectorClient.reset(apiEndpoint, incomingEventId, accessInfo);
      }
      if (incomingEventId && collectorClient.requesterEventId !== incomingEventId) {
        throw new HDSLibError('Found existing collectorClient with a different eventId', { actual: collectorClient.requesterEventId, incoming: incomingEventId });
        // console.log('⚠️⚠️⚠️⚠️ RESET! Found existing collectorClient with a different eventId', { actual: collectorClient.requesterEventId, incoming: incomingEventId });
        // we might consider reseting() in the future;
        // return await collectorClient.reset(apiEndpoint, incomingEventId, accessInfo);
        // return null;
      }
      return collectorClient;
    }
    // check if comming form hdsCollector
    if (!accessInfo?.clientData?.hdsCollector || (accessInfo.clientData?.hdsCollector as any)?.version !== 0) {
      throw new HDSLibError('Invalid collector request, cannot find clientData.hdsCollector or wrong version', { clientData: accessInfo?.clientData });
    }
    // else create it
    const collectorClient = await (CollectorClient as any).create(this, apiEndpoint, incomingEventId, accessInfo);
    this.cache.collectorClientsMap[collectorClient.key] = collectorClient;
    return collectorClient;
  }

  async getCollectorClientByKey (collectorKey: string): Promise<CollectorClient | undefined> {
    // ensure collectors are initialized
    await this.getCollectorClients();
    return this.cache.collectorClientsMap[collectorKey];
  }

  async getCollectorClients (forceRefresh: boolean = false): Promise<CollectorClient[]> {
    if (!forceRefresh && this.cache.collectorClientsMapInitialized) return Object.values(this.cache.collectorClientsMap);
    const apiCalls = [{
      method: 'accesses.get',
      params: { includeDeletions: true }
    }, {
      method: 'events.get',
      params: { types: ['request/collector-client-v1'], streams: [this.baseStreamId], limit: MAX_COLLECTORS }
    }];
    const [accessesRes, eventRes] = await (this.connection as any).api(apiCalls);
    const accessHDSCollectorMap: { [key: string]: any } = {};
    for (const access of accessesRes.accesses) {
      if (access.clientData.hdsCollectorClient) {
        accessHDSCollectorMap[access.name] = access;
      }
    }
    for (const event of eventRes.events) {
      const collectorClient = new CollectorClient(this, event);
      if (accessHDSCollectorMap[collectorClient.key] != null) collectorClient.accessData = accessHDSCollectorMap[collectorClient.key];
      // temp process - might be removed
      await collectorClient.checkConsistency();
      this.cache.collectorClientsMap[collectorClient.key] = collectorClient;
    }

    this.cache.collectorClientsMapInitialized = true;
    return Object.values(this.cache.collectorClientsMap);
  }

  /**
   * - Check connection validity
   * - Make sure stream structure exists
   */
  async init (): Promise<this> {
    return super.init();
  }
}
