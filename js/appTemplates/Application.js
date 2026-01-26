"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Application = void 0;
const patchedPryv_1 = require("../patchedPryv");
const toolkit_1 = require("../toolkit");
const APPS_ROOT_STREAM = 'applications';
/**
 * Common code for AppClientAccount and AppManagingAccount
 */
class Application {
    /** Pryv.Connection */
    connection;
    /** string */
    baseStreamId;
    /** string */
    appName;
    cache = {};
    /** ApplicationFeatures */
    features;
    /**
     * Get application stream structure
     * Initialized at init()
     * Can be refreshed with loadStreamData
     */
    get streamData() {
        if (!this.cache.streamData)
            throw new Error('Call .init() first');
        return this.cache.streamData;
    }
    get appSettings() {
        throw new Error('appSettings must be implemented');
        // possible return values:
        /**
         * return {
         *  canBePersonnal: true,
         *  mustBeMaster: true
         *  appNameFromAccessInfo: true // application name will be taken from Access-Info Name
         * };
         */
    }
    /**
     * Create with an apiEnpoint
     */
    static async newFromApiEndpoint(baseStreamId, apiEndpoint, appName, features) {
        const connection = new patchedPryv_1.pryv.Connection(apiEndpoint);
        // in a static method, "this" is the class (here the extending class)
        return await this.newFromConnection(baseStreamId, connection, appName, features);
    }
    /**
    * Create with an apiEnpoint
    */
    static async newFromConnection(baseStreamId, connection, appName, features) {
        // in a static method "this" is the class (here the extending class)
        const app = new this(baseStreamId, connection, appName, features);
        await app.init();
        return app;
    }
    /**
     * @private
     * use .newFrom...() to create new AppManagingAccount
     */
    constructor(baseStreamId, connection, appName, features) {
        if (!baseStreamId || baseStreamId.length < 2)
            throw new Error('Missing or too short baseStreamId');
        this.baseStreamId = baseStreamId;
        if (appName == null && !this.appSettings.appNameFromAccessInfo) {
            throw new Error('appName must be given unless appSettings.appNameFromAccessInfo = true');
        }
        this.appName = appName || '';
        this.connection = connection;
        this.features = Object.assign({ streamsAutoCreate: true }, features);
        if (this.features.streamsAutoCreate) {
            toolkit_1.StreamsAutoCreate.attachToConnection(this.connection, undefined);
        }
        this.cache = {};
    }
    async init() {
        await createAppStreams(this);
        return this;
    }
    /**
     * Save anything you want for your app
     */
    async setCustomSettings(content) {
        const currentCustomSettings = await this.getCustomSettings();
        if (currentCustomSettings != null) { // update
            const id = this.cache.customSettingsEvent.id;
            const updatedEvent = await this.connection.apiOne('events.update', { id, update: { content } }, 'event');
            this.cache.customSettingsEvent = updatedEvent;
        }
        else {
            await this.#createCustomSettings(content);
        }
        return this.cache.customSettingsEvent?.content;
    }
    /**
     * @private
     * Used by getCustomSettings & setCustomSettings
     */
    async #createCustomSettings(content) {
        const createdEvent = await this.connection.apiOne('events.create', { streamIds: [this.baseStreamId], type: 'settings/any', content }, 'event');
        this.cache.customSettingsEvent = createdEvent;
    }
    /**
     * Get all current settings previously set with setCustomSettings()
     */
    async getCustomSettings(forceRefresh = false) {
        if (forceRefresh || !this.cache.customSettingsEvent) {
            const customSettingsEvent = (await this.connection.apiOne('events.get', { streams: [this.baseStreamId], types: ['settings/any'], limit: 1 }, 'events'))[0];
            this.cache.customSettingsEvent = customSettingsEvent;
        }
        if (!this.cache.customSettingsEvent) {
            await this.#createCustomSettings({});
        }
        return this.cache.customSettingsEvent?.content;
    }
    /**
     * Update value of a custom setting by its key
     * @param {*} value if value is `null` key will be deleted
     */
    async setCustomSetting(key, value) {
        const currentCustomSettings = await this.getCustomSettings();
        if (value === null) {
            delete currentCustomSettings[key];
        }
        else {
            currentCustomSettings[key] = value;
        }
        return this.setCustomSettings(currentCustomSettings);
    }
    /**
     * Force loading of streamData
     */
    async loadStreamData() {
        const streams = (await this.connection.apiOne('streams.get', {}, 'streams'));
        const streamData = findStreamByid(streams, this.baseStreamId);
        if (streamData) {
            this.cache.streamData = streamData;
        }
        return streamData;
    }
}
exports.Application = Application;
// findStream in a tree
function findStreamByid(streams, streamId) {
    for (const stream of streams) {
        if (stream.id === streamId)
            return stream;
        if (stream.children?.length > 0) {
            const streamFromChildren = findStreamByid(stream.children, streamId);
            if (streamFromChildren != null)
                return streamFromChildren;
        }
    }
    return null;
}
// create app Streams
async function createAppStreams(app) {
    // check that connection has a personal or master token or has "manage" rights on baseStream
    const infos = await app.connection.accessInfo();
    if (app.appSettings.appNameFromAccessInfo) {
        app.appName = infos.name;
    }
    let isPersonalOrMaster = infos.type === 'personal';
    if (!app.appSettings.canBePersonnal && infos.type === 'personal') {
        throw new Error('Application should not use a personal token');
    }
    if (!isPersonalOrMaster) {
        const allowPersonalStr = app.appSettings.canBePersonnal ? '"personal" or ' : '';
        if (infos.type !== 'app')
            throw new Error(`Application requires a ${allowPersonalStr} "app" type of access`);
        const masterFound = infos.permissions.find((p) => (p.streamId === '*' && p.level === 'manage'));
        isPersonalOrMaster = true;
        if (app.appSettings.mustBemaster && !masterFound) {
            throw new Error('Application with "app" type of access requires "master" token (streamId = "*", level = "manage")');
        }
        if (!masterFound) { // check that app has "manage" level on baseStreamId
            const baseStreamFound = infos.permissions.find((p) => (p.streamId === app.baseStreamId && p.level === 'manage'));
            if (!baseStreamFound)
                throw new Error(`Application with "app" type of access requires  (streamId = "${app.baseStreamId}", level = "manage") or master access`);
        }
    }
    // get streamStructure
    let found = false;
    try {
        const streamData = await app.loadStreamData();
        if (streamData)
            found = true;
    }
    catch (e) {
        if (e.innerObject?.id !== 'unknown-referenced-resource' || e.innerObject?.data?.id !== app.baseStreamId) {
            throw e;
        }
    }
    // not found create streams
    if (!found) {
        if (!isPersonalOrMaster) {
            throw new Error('Token has not sufficient right to create App streams. Create them upfront');
        }
        const apiCalls = [
            { method: 'streams.create', params: { id: APPS_ROOT_STREAM, name: 'Applications' } },
            { method: 'streams.create', params: { id: app.baseStreamId, name: app.appName, parentId: APPS_ROOT_STREAM } }
        ];
        const streamCreateResult = await app.connection.api(apiCalls);
        if (streamCreateResult[1].error)
            throw new Error('Failed creating app streams ' + JSON.stringify(streamCreateResult[1].error));
        const stream = streamCreateResult[1].stream;
        app.cache.streamData = stream;
    }
}
//# sourceMappingURL=Application.js.map